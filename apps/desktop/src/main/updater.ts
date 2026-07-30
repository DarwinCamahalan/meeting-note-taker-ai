/**
 * Signed auto-update coordinator for the Cue desktop app.
 *
 * Uses `electron-updater`, but with `autoDownload = false` so that NO update is
 * fetched or applied until an INDEPENDENT manifest signature check passes:
 *
 *   1. `checkForUpdates()` (on launch + on an interval) makes electron-updater
 *      resolve the release feed's `latest*.yml` and emit `update-available`.
 *   2. We then independently fetch the same `latest*.yml` and its detached
 *      `.minisig`, and verify the signature against a PINNED minisign public key
 *      whose private half lives with the RELEASE PIPELINE, distinct from the
 *      artifact-host (R2/S3/CDN) credentials (docs/05-remediation-plan,
 *      docs/60-devops-infrastructure).
 *   3. Only if that passes do we call `downloadUpdate()`, at which point
 *      electron-updater performs ITS OWN sha512 (from the yml) + OS
 *      code-signature verification before staging the install.
 *   4. Any signature/parse failure is logged as a TAMPER-REJECT and the update
 *      is abandoned (fail closed) — never downloaded.
 *
 * This module owns the Electron/electron-updater wiring; the security-critical
 * signature math lives in the pure, unit-testable `./update-verify`.
 */
import { autoUpdater, type UpdateInfo } from 'electron-updater';
import { verifyManifestSignature } from './update-verify';

/**
 * BUNDLED fallback for the update-manifest signing public key. Pinned into the
 * app so verification works even if the env var is absent. Populated by the
 * release pipeline at build time (minisign `.pub` payload / bare base64).
 *
 * TODO(devops, docs/60 §release-signing): inject the real pinned public key here
 * at build time (e.g. via a codegen/define step) and keep the PRIVATE half in
 * the CI signing environment ONLY — never in this repo, never with the CDN
 * artifact-host credentials. Rotating this key ships a new app build by design.
 */
export const BUNDLED_UPDATE_MANIFEST_PUBLIC_KEY = '';

/** Minimal logger surface so the caller can route to a real logger later. */
export interface UpdaterLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

const consoleLogger: UpdaterLogger = {
  info: (m) => console.info(`[cue:update] ${m}`),
  warn: (m) => console.warn(`[cue:update] ${m}`),
  error: (m) => console.error(`[cue:update] ${m}`),
};

export interface AutoUpdateOptions {
  /**
   * Release-feed base URL (the directory that contains `latest*.yml`). When
   * omitted, auto-update is disabled (fail closed) rather than falling back to
   * an implicit provider.
   */
  feedUrl?: string;
  /** Pinned minisign public key; overrides the bundled constant when provided. */
  publicKey?: string;
  /** Re-check interval in ms (default 6h). `0` disables the periodic check. */
  intervalMs?: number;
  /** Whether to install automatically when the app quits (default true). */
  autoInstallOnQuit?: boolean;
  logger?: UpdaterLogger;
}

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Map the current platform to its electron-updater manifest filename. */
export function manifestFileName(platform: NodeJS.Platform = process.platform): string {
  switch (platform) {
    case 'darwin':
      return 'latest-mac.yml';
    case 'win32':
      return 'latest.yml';
    default:
      return 'latest-linux.yml';
  }
}

function joinUrl(base: string, name: string): string {
  return `${base.replace(/\/+$/, '')}/${name}`;
}

/** Fetch a URL as raw bytes; returns null on any non-OK/error (fail closed). */
async function fetchBytes(url: string, logger: UpdaterLogger): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn(`fetch ${url} -> HTTP ${res.status}`);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    logger.warn(`fetch ${url} failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Independently fetch + verify the release manifest signature for the current
 * platform against the pinned key. Resolves true ONLY when the signature is
 * valid. Any missing feed/key, network error, or bad signature → false.
 */
export async function verifyRemoteManifest(
  feedUrl: string,
  publicKey: string,
  logger: UpdaterLogger = consoleLogger,
): Promise<boolean> {
  if (!publicKey) {
    logger.error('no pinned UPDATE_MANIFEST_PUBLIC_KEY — refusing to trust update manifest');
    return false;
  }
  const ymlName = manifestFileName();
  const manifestUrl = joinUrl(feedUrl, ymlName);
  const signatureUrl = `${manifestUrl}.minisig`;

  const [manifest, signatureBytes] = await Promise.all([
    fetchBytes(manifestUrl, logger),
    fetchBytes(signatureUrl, logger),
  ]);
  if (!manifest || !signatureBytes) {
    logger.error('TAMPER-REJECT: could not fetch manifest and/or its signature');
    return false;
  }

  const result = verifyManifestSignature(manifest, signatureBytes.toString('utf8'), publicKey);
  if (!result.ok) {
    logger.error(`TAMPER-REJECT: manifest signature invalid — ${result.reason ?? 'unknown'}`);
    return false;
  }
  logger.info(`manifest signature verified for ${ymlName}`);
  return true;
}

let started = false;
let intervalTimer: NodeJS.Timeout | null = null;

/**
 * Wire electron-updater with the independent signature gate and kick off the
 * first check. Idempotent — safe to call once from the app-ready lifecycle.
 */
export function startAutoUpdate(options: AutoUpdateOptions = {}): void {
  const logger = options.logger ?? consoleLogger;
  const publicKey = options.publicKey ?? BUNDLED_UPDATE_MANIFEST_PUBLIC_KEY;
  const feedUrl = options.feedUrl;

  if (started) {
    logger.warn('startAutoUpdate called twice — ignoring');
    return;
  }
  if (!feedUrl) {
    logger.warn('no feed URL configured (RELEASES_URL) — auto-update disabled');
    return;
  }
  if (!publicKey) {
    logger.error('no pinned update-manifest public key — auto-update disabled (fail closed)');
    return;
  }
  started = true;

  // Never let electron-updater fetch/apply until WE have verified the manifest.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = options.autoInstallOnQuit ?? true;
  autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    logger.info(`update ${info.version} available — verifying manifest signature first`);
    void (async () => {
      const trusted = await verifyRemoteManifest(feedUrl, publicKey, logger);
      if (!trusted) {
        logger.error(`refusing update ${info.version}: independent manifest verification failed`);
        return;
      }
      logger.info(`manifest trusted — downloading update ${info.version}`);
      try {
        await autoUpdater.downloadUpdate();
      } catch (err) {
        logger.error(`downloadUpdate failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    logger.info(`no update available (current ${info.version})`);
  });

  // electron-updater's own sha512 + OS code-signature checks have passed here.
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    logger.info(`update ${info.version} downloaded + hash/OS-signature verified; will install on quit`);
  });

  autoUpdater.on('error', (err: Error) => {
    logger.error(`updater error: ${err.message}`);
  });

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err: unknown) => {
      logger.error(`checkForUpdates failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  };

  check();

  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  if (intervalMs > 0) {
    intervalTimer = setInterval(check, intervalMs);
    // Don't keep the event loop alive solely for update checks.
    intervalTimer.unref?.();
  }
}

/** Stop the periodic check (used on shutdown / teardown). */
export function stopAutoUpdate(): void {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
  started = false;
}
