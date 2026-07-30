/**
 * Thin typed transport over fetch: bearer auth, JSON (de)serialization,
 * query-string building, Idempotency-Key generation, and RFC 9457 problem+json
 * parsing into a {@link CueApiError}. One optional retry-on-401 hook lets the
 * client refresh + replay a single time.
 */
import { CueApiError, isProblemDetails } from './errors.js';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  baseUrl: string;
  /** Returns the current access token (or undefined when signed out). */
  getToken?: () => string | undefined;
  /** Called once on a 401; return true if a refresh succeeded (triggers replay). */
  onUnauthorized?: () => Promise<boolean>;
  /** Injectable fetch (defaults to globalThis.fetch). */
  fetch?: FetchLike;
  /** Extra headers merged into every request. */
  defaultHeaders?: Record<string, string>;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined> | undefined;
  body?: unknown;
  /** When true, generates and attaches an Idempotency-Key (UUIDv4). */
  idempotency?: boolean;
  idempotencyKey?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export class HttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly opts: HttpClientOptions;

  constructor(opts: HttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    const f = opts.fetch ?? globalThis.fetch;
    if (typeof f !== 'function') {
      throw new Error('No fetch implementation available; pass options.fetch.');
    }
    this.fetchImpl = f.bind(globalThis);
    this.opts = opts;
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, options);
  }

  patch<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, options);
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }

  private async request<T>(
    method: Method,
    path: string,
    options: RequestOptions = {},
    isRetry = false,
  ): Promise<T> {
    const url = this.baseUrl + path + buildQuery(options.query);
    const headers = this.buildHeaders(method, options);
    const init: RequestInit = { method, headers };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    if (options.signal) init.signal = options.signal;

    const res = await this.fetchImpl(url, init);

    if (res.status === 401 && !isRetry && this.opts.onUnauthorized) {
      const refreshed = await this.opts.onUnauthorized();
      if (refreshed) return this.request<T>(method, path, options, true);
    }

    if (!res.ok) throw await toApiError(res);
    if (res.status === 204) return undefined as T;

    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private buildHeaders(method: Method, options: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.opts.defaultHeaders,
      ...options.headers,
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    const token = this.opts.getToken?.();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    if ((options.idempotency || options.idempotencyKey) && method !== 'GET') {
      headers['Idempotency-Key'] = options.idempotencyKey ?? crypto.randomUUID();
    }
    return headers;
  }
}

function buildQuery(query: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function toApiError(res: Response): Promise<CueApiError> {
  let problem: unknown;
  try {
    problem = await res.json();
  } catch {
    problem = undefined;
  }
  return new CueApiError(res.status, isProblemDetails(problem) ? problem : undefined, res.statusText);
}
