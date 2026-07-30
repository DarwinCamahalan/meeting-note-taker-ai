/**
 * @cue/types/api — HTTP/WS contract surface shared across the Cue backend, the
 * desktop app, the web app, and the typed SDK.
 *
 * These are the Phase 1 (MVP) wire DTOs. They are transport-agnostic plain
 * data (no class instances) so they survive JSON and structured-clone IPC.
 *
 * NOTE ON SOURCES OF TRUTH (per 22-api-contracts.md §7): in the target design
 * the HTTP DTOs are *generated* from the `api` Zod schemas and the WS envelope
 * is hand-authored. For Phase 1 these hand-written types are the contract the
 * SDK and services import; when the Zod codegen lands it emits the same shapes.
 */

/* ------------------------------------------------------------------ *
 * Shared domain enums (string unions — additive; tolerate unknowns)
 * ------------------------------------------------------------------ */

/** Product plan tiers. */
export type Plan = 'free' | 'pro' | 'team' | 'enterprise';

/** Data residency region, pinned at signup. */
export type DataRegion = 'us' | 'eu';

/** RBAC role within an org context. */
export type OrgRole = 'owner' | 'admin' | 'member' | 'billing';

/** The kind of copilot session (mirrors the `session_mode` DB enum). */
export type SessionKind =
  | 'interview_prep'
  | 'interview_live'
  | 'sales'
  | 'support'
  | 'meeting_notes';

/** Lifecycle status of a persisted session record. */
export type SessionStatus =
  | 'created'
  | 'active'
  | 'ended'
  | 'processing'
  | 'failed'
  | 'purged';

/** Speaker attribution (diarization) on a transcript segment. */
export type Speaker = 'them' | 'me' | 'unknown';

/** Claude models usable on the live hot path. */
export type LiveModel = 'haiku-4-5' | 'sonnet-5';

/* ------------------------------------------------------------------ *
 * Auth — OAuth2 PKCE (device-code MVP variant), per this spec's contract
 * ------------------------------------------------------------------ */

/** PKCE challenge method. Only S256 is accepted server-side. */
export type PkceChallengeMethod = 'S256';

/** `POST /v1/auth/pkce/start` request body. */
export interface PkceStartRequest {
  /** base64url(sha256(code_verifier)). */
  code_challenge: string;
  /** Defaults to 'S256' when omitted. */
  code_challenge_method?: PkceChallengeMethod;
}

/** `POST /v1/auth/pkce/start` response body. */
export interface PkceStartResponse {
  /** Opaque handle the client polls / exchanges with. */
  device_code: string;
  /** Web page the user opens in the system browser to approve the device. */
  verification_uri: string;
  /** Suggested poll interval (seconds) before calling exchange. */
  interval: number;
  /** Lifetime of the device_code (seconds). */
  expires_in: number;
}

/** `POST /v1/auth/pkce/exchange` request body. */
export interface PkceExchangeRequest {
  device_code: string;
  /** The original PKCE verifier; server checks S256(code_verifier) == challenge. */
  code_verifier: string;
}

/** OAuth-style token bundle returned by exchange + refresh. */
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  /** Access-token lifetime in seconds (MVP: 600). */
  expires_in: number;
}

/** `POST /v1/auth/refresh` request body. */
export interface RefreshRequest {
  refresh_token: string;
}

/* ------------------------------------------------------------------ *
 * Identity resources
 * ------------------------------------------------------------------ */

/** The authenticated user, as returned by `GET /v1/me`. */
export interface User {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  dataRegion: DataRegion;
  /** Active org context for this token (personal org for consumer users). */
  orgId: string;
  createdAt: string;
}

/** An organization / tenant. */
export interface Org {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  dataRegion: DataRegion;
  isPersonal: boolean;
  createdAt: string;
}

/** `GET /v1/me` response: the user plus their active org and roles. */
export interface MeResponse {
  user: User;
  org: Org;
  roles: OrgRole[];
}

/* ------------------------------------------------------------------ *
 * Sessions
 * ------------------------------------------------------------------ */

/** A persisted session record. */
export interface Session {
  id: string;
  orgId: string;
  userId: string;
  kind: SessionKind;
  title: string | null;
  disclosed: boolean;
  status: SessionStatus;
  language: string;
  documentIds: string[];
  durationSeconds: number;
  createdAt: string;
}

/** `POST /v1/sessions` request body. */
export interface CreateSessionRequest {
  kind: SessionKind;
  title?: string;
  /** Defaults to false. */
  disclosed?: boolean;
  /** RAG document scope; defaults to []. */
  documentIds?: string[];
  /** ISO-639-1 code; defaults to 'en'. */
  language?: string;
}

/** Query params for `GET /v1/sessions`. */
export interface ListSessionsQuery {
  cursor?: string;
  /** 1..100, default 20. */
  limit?: number;
}

/** Single-use realtime ticket for `ws-gateway` (from `/ws-ticket`). */
export interface WsTicket {
  ticket: string;
  wsUrl: string;
  protocol: 'cue.v1';
  expiresAt: string;
}

/* ------------------------------------------------------------------ *
 * Documents (stubbed in MVP)
 * ------------------------------------------------------------------ */

export type DocumentKind =
  | 'resume'
  | 'job_description'
  | 'knowledge_base'
  | 'product_doc'
  | 'other';

export type DocumentStatus =
  | 'awaiting_upload'
  | 'uploaded'
  | 'parsing'
  | 'embedding'
  | 'ready'
  | 'failed';

export interface CueDocument {
  id: string;
  orgId: string;
  kind: DocumentKind;
  title: string;
  status: DocumentStatus;
  createdAt: string;
}

/* ------------------------------------------------------------------ *
 * Pagination envelope (single wrapper for every list endpoint)
 * ------------------------------------------------------------------ */

export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/* ------------------------------------------------------------------ *
 * Error taxonomy — RFC 9457 problem+json (22-api-contracts.md §4)
 * The machine `code` is the contract; switch on it, not on `status`.
 * ------------------------------------------------------------------ */

export type AppErrorCode =
  | 'AUTH_INVALID_TOKEN'
  | 'AUTH_DEVICE_UNBOUND'
  | 'AUTH_STEP_UP_REQUIRED'
  | 'FORBIDDEN_ROLE'
  | 'ENTITLEMENT_REQUIRED'
  | 'QUOTA_LIVE_MINUTES'
  | 'VALIDATION_FAILED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UPSTREAM_STT'
  | 'UPSTREAM_LLM'
  | 'UPSTREAM_BILLING'
  | 'INTERNAL';

export interface FieldError {
  path: string;
  message: string;
}

export interface ProblemDetails {
  /** Stable URI, https://errors.usecue.app/<slug>. */
  type: string;
  /** Short human summary. */
  title: string;
  /** Mirrors the HTTP status. */
  status: number;
  /** Machine-readable — switch on THIS. */
  code: AppErrorCode;
  /** Instance-specific human message. */
  detail?: string;
  /** Offending path. */
  instance?: string;
  /** Correlates across services (== OTel trace id). */
  requestId?: string;
  /** Present iff code === 'VALIDATION_FAILED'. */
  errors?: FieldError[];
  /** Present iff code === 'ENTITLEMENT_REQUIRED'. */
  entitlementKey?: string;
  /** Present on RATE_LIMITED / UPSTREAM_*. */
  retryAfterMs?: number;
}

/* ------------------------------------------------------------------ *
 * WebSocket control protocol — `cue.v1` (22-api-contracts.md §5.3)
 * Shared verbatim by ws-gateway AND desktop. Binary audio frames are NOT
 * JSON; only these control/data envelopes are.
 * ------------------------------------------------------------------ */

/** Audio codecs supported on the WS uplink. */
export type WsCodec = 'opus' | 'pcm16';

/** Sample rates supported on the WS uplink. */
export type WsSampleRate = 16000 | 48000;

/** Client -> server control envelope (discriminated on `t`). */
export type ClientMsg =
  | {
      t: 'hello';
      protocol: 'cue.v1';
      /** Carries auth; MUST be the first message (§5.2). */
      ticket: string;
      codec: WsCodec;
      sampleRate: WsSampleRate;
      /** Last seen `seq` for resume; omit for a fresh stream. */
      resumeFrom?: number;
    }
  | { t: 'mute'; channel: 'mic' | 'loopback'; muted: boolean }
  | { t: 'ask'; prompt: string }
  | { t: 'mode'; disclosed: boolean }
  | { t: 'heartbeat'; ts: number }
  | { t: 'end' };

/** Server -> client control/data envelope (discriminated on `t`). */
export type ServerMsg =
  | { t: 'ready'; sessionId: string; heartbeatSec: number; resumedFrom?: number }
  | { t: 'transcript.partial'; speaker: Speaker; text: string; ts: number }
  | {
      t: 'transcript.final';
      speaker: Speaker;
      seq: number;
      text: string;
      startMs: number;
      endMs: number;
    }
  | { t: 'cue.delta'; cueId: string; text: string }
  | { t: 'cue.final'; cueId: string; seq: number; text: string; model: LiveModel }
  | { t: 'entitlements.updated'; version: number }
  | { t: 'backpressure'; level: 'ok' | 'shed' }
  | { t: 'quota.exceeded'; remainingMs: 0 }
  | { t: 'heartbeat'; ts: number }
  | { t: 'error'; code: WsErrorCode; message: string }
  | { t: 'session.finalizing' };

/** WS-specific error codes (distinct from the HTTP AppErrorCode union). */
export type WsErrorCode =
  | 'WS_TICKET_INVALID'
  | 'WS_TICKET_EXPIRED'
  | 'WS_TICKET_REPLAY'
  | 'WS_AUTH_TIMEOUT'
  | 'WS_PROTOCOL_UNSUPPORTED'
  | 'WS_RESUME_EXPIRED'
  | 'WS_BACKPRESSURE'
  | 'QUOTA_LIVE_MINUTES';

/**
 * Binary audio-frame header layout (4-byte little-endian prefix + payload).
 * Kept here so ws-gateway and desktop encode/decode against one constant set.
 */
export const WS_AUDIO_FRAME = {
  /** byte 0 — frame type. */
  TYPE_OPUS: 0x01,
  TYPE_PCM16: 0x02,
  /** byte 1 — channel. */
  CHANNEL_MIXED: 0x00,
  CHANNEL_MIC: 0x01,
  CHANNEL_LOOPBACK: 0x02,
  /** Total header length in bytes (type, channel, uint16 seq). */
  HEADER_BYTES: 4,
} as const;
