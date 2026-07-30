/**
 * Resource groupings over the {@link HttpClient}. Each method maps 1:1 to an
 * `api` REST endpoint and is fully typed against @cue/types.
 */
import type {
  AuthTokens,
  CreateSessionRequest,
  ListSessionsQuery,
  MeResponse,
  Paginated,
  PkceExchangeRequest,
  PkceStartRequest,
  PkceStartResponse,
  RefreshRequest,
  Session,
  WsTicket,
} from '@cue/types';
import type { HttpClient } from './http-client.js';

export class AuthResource {
  constructor(private readonly http: HttpClient) {}

  /** `POST /v1/auth/pkce/start` — begin the desktop PKCE device flow. */
  pkceStart(body: PkceStartRequest): Promise<PkceStartResponse> {
    return this.http.post<PkceStartResponse>('/v1/auth/pkce/start', { body });
  }

  /** `POST /v1/auth/pkce/exchange` — trade an approved device_code for tokens. */
  pkceExchange(body: PkceExchangeRequest): Promise<AuthTokens> {
    return this.http.post<AuthTokens>('/v1/auth/pkce/exchange', { body, idempotency: true });
  }

  /** `POST /v1/auth/refresh` — rotate the refresh token and mint a new access token. */
  refresh(body: RefreshRequest): Promise<AuthTokens> {
    return this.http.post<AuthTokens>('/v1/auth/refresh', { body, idempotency: true });
  }
}

export class SessionsResource {
  constructor(private readonly http: HttpClient) {}

  /** `POST /v1/sessions` — create a session record before a meeting. */
  create(body: CreateSessionRequest, opts?: { idempotencyKey?: string }): Promise<Session> {
    return this.http.post<Session>('/v1/sessions', {
      body,
      idempotency: true,
      ...(opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
    });
  }

  /** `GET /v1/sessions` — cursor-paginated list of session records. */
  list(query?: ListSessionsQuery): Promise<Paginated<Session>> {
    return this.http.get<Paginated<Session>>('/v1/sessions', {
      query: { cursor: query?.cursor, limit: query?.limit },
    });
  }

  /** `GET /v1/sessions/:id` — read one session record. */
  get(id: string): Promise<Session> {
    return this.http.get<Session>(`/v1/sessions/${encodeURIComponent(id)}`);
  }

  /** `POST /v1/sessions/:id/ws-ticket` — mint a single-use realtime ticket. */
  wsTicket(id: string): Promise<WsTicket> {
    return this.http.post<WsTicket>(`/v1/sessions/${encodeURIComponent(id)}/ws-ticket`, {
      idempotency: true,
    });
  }
}

export class UsersResource {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/me` — the authenticated user, active org, and roles. */
  me(): Promise<MeResponse> {
    return this.http.get<MeResponse>('/v1/me');
  }
}
