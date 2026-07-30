import { createHash, randomBytes } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, safeStorage, shell } from 'electron';
import { CueApiClient, CueApiError } from '@cue/sdk';
import type { AuthState, AuthTokens } from '@cue/types';

/**
 * Main-process OAuth2 PKCE (device-code MVP variant) manager.
 *
 * Flow (per this spec's auth contract):
 *   1. Generate a PKCE verifier + S256 challenge.
 *   2. `POST /v1/auth/pkce/start` -> { device_code, verification_uri, interval }.
 *   3. Open `verification_uri` in the system browser (shell.openExternal).
 *   4. Poll `POST /v1/auth/pkce/exchange` every `interval` s until it returns
 *      tokens or `expires_in` elapses.
 *   5. Persist tokens encrypted at rest via Electron `safeStorage`.
 *
 * Tokens live inside the wrapped {@link CueApiClient} (which auto-refreshes on
 * 401); this manager only mirrors a redacted {@link AuthState} to the UI and
 * owns encrypted persistence. It never exposes raw tokens to the renderer.
 *
 * TODO(real IdP: Clerk/WorkOS): the MVP `verification_uri` may auto-approve a
 * dev user server-side. Swap for a real hosted sign-in before shipping.
 */

/** Persisted token envelope (encrypted blob written to userData). */
interface PersistedTokens {
  tokens: AuthTokens;
  /** epoch ms the access token was obtained (for diagnostics only). */
  obtainedAt: number;
}

export interface AuthManagerOptions {
  /** api BFF base URL (e.g. http://localhost:3001). */
  apiBaseUrl: string;
  /** Overridable clock/sleep for tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** PKCE verifier + its S256 challenge (base64url, no padding). */
interface PkcePair {
  verifier: string;
  challenge: string;
}

const AUTH_FILE = 'cue-auth.enc';

export class AuthManager {
  private readonly client: CueApiClient;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly listeners = new Set<(s: AuthState) => void>();

  private state: AuthState = { status: 'signed_out' };
  /** Guards against overlapping login() calls. */
  private loginInFlight: Promise<AuthState> | undefined;

  constructor(options: AuthManagerOptions) {
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.client = new CueApiClient({ baseUrl: options.apiBaseUrl });
  }

  /**
   * Rehydrate persisted tokens (call once after `app.whenReady()`). Best-effort:
   * a missing/corrupt/undecryptable blob simply leaves the user signed out.
   */
  async init(): Promise<void> {
    const persisted = await this.loadTokens();
    if (!persisted) return;
    this.client.setTokens(persisted.tokens);
    // Optimistically signed-in; confirm + hydrate the profile in the background.
    this.setState({ status: 'signed_in' });
    void this.hydrateProfile();
  }

  /** The authenticated api client, shared with the gateway pipeline. */
  getClient(): CueApiClient {
    return this.client;
  }

  /** Current access token, if signed in (per the spec's `getToken`). */
  getToken(): string | undefined {
    return this.client.getTokens()?.access_token;
  }

  /** A snapshot of the current auth state. */
  getState(): AuthState {
    return this.state;
  }

  /** Subscribe to state changes; returns an unsubscribe fn. */
  onState(cb: (s: AuthState) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Run (or join an in-flight) PKCE login. Idempotent while pending. */
  login(): Promise<AuthState> {
    if (this.state.status === 'signed_in') return Promise.resolve(this.state);
    if (this.loginInFlight) return this.loginInFlight;
    this.loginInFlight = this.runLogin().finally(() => {
      this.loginInFlight = undefined;
    });
    return this.loginInFlight;
  }

  /** Drop tokens, wipe the encrypted blob, and return to `signed_out`. */
  async logout(): Promise<void> {
    this.client.clearTokens();
    await this.clearPersistedTokens();
    this.setState({ status: 'signed_out' });
  }

  private async runLogin(): Promise<AuthState> {
    try {
      const pkce = createPkcePair();
      this.setState({ status: 'authenticating' });

      const start = await this.client.auth.pkceStart({ code_challenge: pkce.challenge });
      this.setState({ status: 'authenticating', verificationUri: start.verification_uri });
      await shell.openExternal(start.verification_uri);

      const tokens = await this.pollExchange(start.device_code, pkce.verifier, start);
      this.client.setTokens(tokens);
      await this.persistTokens(tokens);

      this.setState({ status: 'signed_in' });
      await this.hydrateProfile();
      return this.state;
    } catch (err) {
      this.setState({ status: 'error', error: errorMessage(err) });
      return this.state;
    }
  }

  /**
   * Poll `/pkce/exchange` at the server's cadence until tokens are issued or the
   * device code expires. A pending approval surfaces as a 4xx problem+json; any
   * other error aborts immediately.
   */
  private async pollExchange(
    deviceCode: string,
    verifier: string,
    start: { interval: number; expires_in: number },
  ): Promise<AuthTokens> {
    const intervalMs = Math.max(1, start.interval) * 1000;
    const deadline = this.now() + Math.max(1, start.expires_in) * 1000;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      await this.sleep(intervalMs);
      try {
        return await this.client.auth.pkceExchange({
          device_code: deviceCode,
          code_verifier: verifier,
        });
      } catch (err) {
        if (!isPendingApproval(err)) throw err;
        if (this.now() >= deadline) {
          throw new Error('Sign-in timed out before the device was approved.');
        }
      }
    }
  }

  /** Fetch `GET /v1/me` and fold the identity summary into the state. */
  private async hydrateProfile(): Promise<void> {
    try {
      const me = await this.client.me();
      this.setState({
        status: 'signed_in',
        user: { email: me.user.email, displayName: me.user.displayName },
      });
    } catch (err) {
      // A failed /me while holding tokens is non-fatal (e.g. api briefly down);
      // keep the signed-in state without a profile rather than forcing re-auth.
      console.warn('[cue] Failed to load profile:', errorMessage(err));
    }
  }

  private setState(next: AuthState): void {
    this.state = next;
    for (const cb of this.listeners) cb(next);
  }

  /* --- Encrypted persistence (Electron safeStorage) --- */

  private tokenFilePath(): string {
    return join(app.getPath('userData'), AUTH_FILE);
  }

  private async persistTokens(tokens: AuthTokens): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      // Dev fallback: skip disk persistence rather than write plaintext secrets.
      console.warn('[cue] safeStorage unavailable; tokens kept in memory only.');
      return;
    }
    const payload: PersistedTokens = { tokens, obtainedAt: this.now() };
    const encrypted = safeStorage.encryptString(JSON.stringify(payload));
    await writeFile(this.tokenFilePath(), encrypted);
  }

  private async loadTokens(): Promise<PersistedTokens | undefined> {
    if (!safeStorage.isEncryptionAvailable()) return undefined;
    try {
      const encrypted = await readFile(this.tokenFilePath());
      const json = safeStorage.decryptString(encrypted);
      const parsed = JSON.parse(json) as PersistedTokens;
      if (parsed?.tokens?.access_token) return parsed;
      return undefined;
    } catch {
      return undefined;
    }
  }

  private async clearPersistedTokens(): Promise<void> {
    try {
      await unlink(this.tokenFilePath());
    } catch {
      // Already absent — nothing to clear.
    }
  }
}

/** Generate a PKCE verifier and its base64url S256 challenge. */
function createPkcePair(): PkcePair {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A 4xx problem from the api means "not approved yet" — keep polling. */
function isPendingApproval(err: unknown): boolean {
  return err instanceof CueApiError && err.status >= 400 && err.status < 500;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
