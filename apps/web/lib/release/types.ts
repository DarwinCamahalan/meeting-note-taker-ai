/**
 * Release-feed contract consumed by `/api/latest-release`, the download UI, and
 * (in prod) `electron-updater`. Per `docs/11-web-landing.md §6.2` this shape is
 * meant to live in `@cue/types` so the site and the desktop updater agree.
 *
 * TODO(@cue/types): promote `ReleaseManifest`/`ReleaseAsset` into `@cue/types`
 * once the desktop auto-updater consumer lands, and import from there instead.
 */

export type ReleaseOs = 'mac' | 'windows' | 'linux';
export type ReleaseArch = 'arm64' | 'x64' | 'universal';
export type ReleaseExt = 'dmg' | 'exe' | 'AppImage' | 'deb';
export type ReleaseChannel = 'stable' | 'beta';

export interface ReleaseAsset {
  os: ReleaseOs;
  arch: ReleaseArch;
  ext: ReleaseExt;
  /** Signed, long-lived CDN URL. Binaries never touch this app's origin. */
  url: string;
  size: number;
  /** Matches the `electron-updater` descriptor for the same build. */
  sha512: string;
}

export interface ReleaseManifest {
  /** semver, e.g. "1.4.2". */
  version: string;
  channel: ReleaseChannel;
  /** ISO-8601 timestamp. */
  releasedAt: string;
  notesUrl: string;
  assets: ReleaseAsset[];
  /**
   * INDEPENDENT minisign detached signature over the desktop auto-updater's
   * `latest*.yml` manifest, base64 (`.minisig` payload). Signed with a key
   * DISTINCT from the artifact host so the desktop updater can verify the
   * manifest BEFORE sha512 / OS-signature (docs/05-remediation-plan). Absent
   * when the feed has not been signed yet (local dev / static fallback).
   */
  signature?: string;
  /** Long-lived CDN URL of the detached signature (`<manifest>.minisig`). */
  signatureUrl?: string;
}
