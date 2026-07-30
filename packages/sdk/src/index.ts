/**
 * @cue/sdk — the typed client for the Cue `api` BFF.
 *
 * Wraps @cue/types with transport (fetch), bearer auth, problem+json parsing,
 * idempotency-key generation, and automatic refresh-on-401 (refresh once, then
 * replay the original request). Callers never hand-write fetch.
 *
 *   const cue = new CueApiClient({ baseUrl: 'https://api.usecue.app' });
 *   const tokens = await cue.auth.pkceExchange({ device_code, code_verifier });
 *   cue.setTokens(tokens);
 *   const { user, org } = await cue.me();
 */
import type { AuthTokens } from '@cue/types';
import { HttpClient, type FetchLike } from './http-client.js';
import {
  AuthResource,
  BillingResource,
  DocumentsResource,
  SessionsResource,
  UsersResource,
} from './resources.js';

export interface CueApiClientOptions {
  baseUrl: string;
  /** Seed tokens (e.g. rehydrated from secure storage). */
  tokens?: AuthTokens;
  /** Injectable fetch (defaults to globalThis.fetch). */
  fetch?: FetchLike;
  /** Extra headers merged into every request (e.g. a client version tag). */
  defaultHeaders?: Record<string, string>;
}

export class CueApiClient {
  readonly auth: AuthResource;
  readonly sessions: SessionsResource;
  readonly documents: DocumentsResource;
  readonly billing: BillingResource;
  private readonly users: UsersResource;
  private readonly http: HttpClient;

  private tokens: AuthTokens | undefined;
  private refreshing = false;

  constructor(options: CueApiClientOptions) {
    this.tokens = options.tokens;

    this.http = new HttpClient({
      baseUrl: options.baseUrl,
      getToken: () => this.tokens?.access_token,
      onUnauthorized: () => this.handleUnauthorized(),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.defaultHeaders ? { defaultHeaders: options.defaultHeaders } : {}),
    });

    this.auth = new AuthResource(this.http);
    this.sessions = new SessionsResource(this.http);
    this.documents = new DocumentsResource(this.http);
    this.billing = new BillingResource(this.http);
    this.users = new UsersResource(this.http);
  }

  /** `GET /v1/me` convenience passthrough. */
  me() {
    return this.users.me();
  }

  /** Store tokens (after PKCE exchange or an out-of-band refresh). */
  setTokens(tokens: AuthTokens): void {
    this.tokens = tokens;
  }

  /** Drop tokens (sign-out). */
  clearTokens(): void {
    this.tokens = undefined;
  }

  /** The current tokens, if signed in. */
  getTokens(): AuthTokens | undefined {
    return this.tokens;
  }

  private async handleUnauthorized(): Promise<boolean> {
    // Guard reentrancy: the refresh call must not recurse into this handler.
    if (this.refreshing || !this.tokens?.refresh_token) return false;
    this.refreshing = true;
    try {
      const next = await this.auth.refresh({ refresh_token: this.tokens.refresh_token });
      this.tokens = next;
      return true;
    } catch {
      this.tokens = undefined;
      return false;
    } finally {
      this.refreshing = false;
    }
  }
}

export { CueApiError, isProblemDetails } from './errors.js';
export { HttpClient } from './http-client.js';
export type { FetchLike, HttpClientOptions, RequestOptions } from './http-client.js';
export {
  AuthResource,
  BillingResource,
  DocumentsResource,
  SessionsResource,
  UsersResource,
} from './resources.js';
