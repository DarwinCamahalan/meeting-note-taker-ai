# API & Contract Specification

> Status: Draft · Owner: Principal Architect (Backend / API) · Last updated: 2026-07-29 · Related: [Backend services](20-backend-services.md) · [System architecture](02-system-architecture.md) · [Repository structure](03-repository-structure.md) · [Data model](30-data-model.md) · [Authentication](40-authentication.md) · [Subscriptions & entitlements](50-subscriptions-entitlements.md) · [Decision record](04-decision-record.md) · [Remediation plan](05-remediation-plan.md)

This is the **authoritative wire-contract specification** for Cue. It deepens [Backend services](20-backend-services.md) §3/§6/§8/§10 into a callable spec: the `services/api` REST surface (grouped by resource, with concrete request/response JSON and a single error taxonomy), the `ws-gateway` WebSocket protocol (`cue.v1`), the `ws-gateway ↔ ai-orchestrator` gRPC bidi contract, the code-generated `packages/types` DTO contract, and the cross-cutting versioning / idempotency / pagination conventions every surface inherits.

It does **not** re-derive service topology ([Backend services](20-backend-services.md)), the token/PKCE model ([Authentication](40-authentication.md)), the SQL schema ([Data model](30-data-model.md)), or the entitlement resolution algorithm ([Entitlements](50-subscriptions-entitlements.md)) — those are the source of truth and are linked, not duplicated.

> **Refinements this doc makes canonical** (per [remediation plan](05-remediation-plan.md)): the WS auth ticket is delivered in the **first application message** (or the `Sec-WebSocket-Protocol` subprotocol), **never** on the query string — this supersedes the `?ticket=…` illustration in [Backend services §6.1](20-backend-services.md). The error machine-code for a missing feature gate is canonicalized to `ENTITLEMENT_REQUIRED` (+ `entitlementKey`), reconciling the illustrative `ENTITLEMENT_RAG_UPLOAD` / `ENTITLEMENT_DENIED` sketches in [Backend services §10](20-backend-services.md) / [Entitlements §5.1](50-subscriptions-entitlements.md).

---

## 1. REST conventions (all `services/api` endpoints)

| Concern | Rule |
|---|---|
| Base URL | `https://api.usecue.app` (regional: `…-eu.usecue.app`); WS edge `wss://rt.usecue.app` |
| Versioning | URL-prefixed `/v1`; additive-only within a major (§10) |
| Transport | HTTP/1.1 + JSON (`application/json; charset=utf-8`) over TLS 1.2+ |
| Auth | `Authorization: Bearer <access-JWT>` (ES256, ≤10 min) — verified by `JwtAuthGuard` against cached JWKS ([Auth §2](40-authentication.md)) |
| Request id | `X-Request-Id` echoed back + used as the OTel trace id; server-generated if absent |
| Validation | Zod at the boundary (`ZodValidationPipe`); the same schema is the DTO source of truth (§9) |
| Errors | RFC 9457 `application/problem+json`, one taxonomy (§4) |
| Idempotency | `Idempotency-Key` on every unsafe mutation (§10.2) |
| Pagination | Opaque cursor, `?cursor=&limit=` (max 100) (§10.3) |
| Rate limit | Redis token bucket; `429` carries `Retry-After` + `RateLimit-*` (§10.4) |
| Timestamps | ISO-8601 UTC (`2026-07-29T10:12:00.000Z`); durations in `…Ms`/`…Seconds` |
| IDs | Prefixed opaque strings (`usr_`, `org_`, `ses_`, `doc_`, `mbr_`) over UUIDv7 ([Data model §3.1](30-data-model.md)) |

### 1.1 Canonical status codes

| Code | Used for |
|---|---|
| `200` / `201` / `202` | read/update · create · accepted async (embedding, summary, erasure) |
| `204` | delete / logout with no body |
| `400` | malformed request (not a field-validation failure — that is `422`) |
| `401` / `402` / `403` | unauthenticated/expired · quota/payment required · authorized-but-forbidden |
| `404` / `409` / `422` | missing or not-owned · idempotency/state conflict · Zod field validation |
| `429` | rate-limited |
| `500` / `502` / `503` | internal · upstream (STT/LLM/Stripe) failure · shedding / not-ready |

---

## 2. Resource map (`services/api`)

All paths are `/v1/*`. `A` = auth required, `I` = accepts `Idempotency-Key`, `S` = requires step-up ([Auth §5.2](40-authentication.md)), `E` = entitlement-gated.

| Resource | Method & path | Flags | Purpose |
|---|---|---|---|
| **auth** | `POST /auth/token` | I | PKCE code → Cue tokens ([Auth §3.2](40-authentication.md)) |
| | `POST /auth/refresh` | I | rotate refresh + mint access (DPoP proof) |
| | `POST /auth/step-up` | A | re-mint token after TOTP |
| | `POST /auth/logout` · `POST /auth/logout-all` | A | revoke session(s) |
| | `GET /auth/sessions` · `DELETE /auth/sessions/:sid` | A,S* | list / revoke sessions |
| | `GET /.well-known/jwks.json` | — | public verification keys |
| **users** | `GET /users/me` · `PATCH /users/me` | A | self profile |
| | `DELETE /users/me` | A,S | account erasure → `data-erasure` job |
| | `GET /users/me/devices` · `DELETE /users/me/devices/:id` | A,S* | device management ([Auth §3.4](40-authentication.md)) |
| **orgs** | `POST /orgs` · `GET /orgs` | A,I | create / list my orgs |
| | `GET /orgs/:id` · `PATCH /orgs/:id` | A | read / update org |
| | `DELETE /orgs/:id` | A,S | delete org (`org:owner`) |
| **org-members** | `GET /orgs/:id/members` | A | list members (cursor) |
| | `POST /orgs/:id/members` | A,I,E | invite member (`org.rbac`) |
| | `PATCH /orgs/:id/members/:mid` · `DELETE …` | A | change role / remove |
| **sessions** | `POST /sessions` · `GET /sessions` | A,I | create / list session records |
| | `GET /sessions/:id` · `PATCH /sessions/:id` · `DELETE /sessions/:id` | A | read / update / delete |
| | `POST /sessions/:id/ws-ticket` | A,I | mint single-use WS ticket (§5.2) |
| **transcripts** | `GET /sessions/:id/transcript` | A | final segments (cursor) |
| | `GET /sessions/:id/cues` · `GET /sessions/:id/summary` | A | cue history · async summary |
| **documents** | `POST /documents` | A,I,E | presign upload (`rag.upload`) |
| | `POST /documents/:id/complete` | A,I | trigger `embeddings` job |
| | `GET /documents` · `DELETE /documents/:id` | A | list / delete (cascade) |
| **entitlements** | `GET /users/me/entitlements` | A | resolved snapshot ([Entitlements §4.3](50-subscriptions-entitlements.md)) |
| | `GET /users/me/usage` | A | live-minute meter (polled 30s) |
| **billing** | `POST /billing/checkout` · `POST /billing/portal` | A,I | Stripe Checkout / Portal session |
| | `POST /webhooks/stripe` | — | Stripe ingest (raw-body sig verify; `billing-webhooks` module) |

\* Revoking **another** member's device/session is step-up-gated; revoking your own is not.

---

## 3. Representative request/response contracts

Full DTOs live in `packages/types` (§9); the shapes below are the canonical examples. Envelopes and error bodies are identical across all resources.

**`POST /v1/sessions`** — create a session record before a meeting.

```http
POST /v1/sessions HTTP/1.1
Authorization: Bearer <jwt>
Idempotency-Key: 4f1c9e2a-…-e2
Content-Type: application/json

{ "kind": "interview_live", "title": "Backend SWE loop", "disclosed": false, "documentIds": ["doc_9a2"], "language": "en" }
```
```jsonc
// 201 Created
{
  "id": "ses_7Kd2", "orgId": "org_18b", "userId": "usr_2a9",
  "kind": "interview_live", "title": "Backend SWE loop",
  "disclosed": false, "status": "created", "language": "en",
  "documentIds": ["doc_9a2"], "durationSeconds": 0,
  "createdAt": "2026-07-29T10:12:00.000Z"
}
```

**`POST /v1/sessions/ses_7Kd2/ws-ticket`** — single-use, 60s, session-scoped (§5.2).

```jsonc
// 200 OK
{ "ticket": "eyJhbGciOi…", "wsUrl": "wss://rt.usecue.app/v1/stream",
  "protocol": "cue.v1", "expiresAt": "2026-07-29T10:13:00.000Z" }
```

**`POST /v1/documents`** — presign a RAG upload; client PUTs to R2, then calls `/complete`.

```jsonc
// 201 Created
{
  "id": "doc_9a2", "kind": "resume", "status": "awaiting_upload",
  "upload": { "method": "PUT",
    "url": "https://r2.usecue.app/…/doc_9a2?X-Amz-Signature=…",
    "headers": { "Content-Type": "application/pdf" }, "expiresInSeconds": 900 }
}
```

**`GET /v1/sessions/ses_7Kd2/transcript?limit=2`** — cursor-paginated final segments (§10.3).

```jsonc
// 200 OK — decrypted at the app layer from per-org envelope (Data model §9.4)
{
  "data": [
    { "id": "seg_01", "speaker": "them", "content": "Walk me through…", "startMs": 1200, "endMs": 3400, "isFinal": true },
    { "id": "seg_02", "speaker": "me",   "content": "Sure — the design…", "startMs": 3600, "endMs": 8900, "isFinal": true }
  ],
  "nextCursor": "eyJvIjoyfQ==", "hasMore": true
}
```

**`GET /v1/users/me/entitlements`** — resolved snapshot; shape owned by [Entitlements §4.3](50-subscriptions-entitlements.md).

```jsonc
// 200 OK
{
  "userId": "usr_2a9", "orgId": "org_18b", "tier": "pro", "status": "active",
  "periodEnd": "2026-08-14T00:00:00.000Z", "version": 42,
  "keys": {
    "live.session":       { "enabled": true },
    "live.minutes.quota": { "enabled": true, "limit": 1200, "remaining": 812 },
    "model.sonnet":       { "enabled": true },
    "rag.upload":         { "enabled": true, "limit": 50, "remaining": 49 }
  }
}
```

---

## 4. Error taxonomy (unified)

Every HTTP error is RFC 9457 `application/problem+json`; every WS error is `{ t:"error", code, message }` (§5.4). The **machine `code` is the contract** — codes are additive and never renumbered. The shape and the `AppErrorCode` union live in `packages/types/src/http/errors.ts` and are the single source of truth for both surfaces.

```ts
// packages/types/src/http/errors.ts
export interface ProblemDetails {
  type: string;                 // stable URI, https://errors.usecue.app/<slug>
  title: string;                // short human summary
  status: number;               // mirrors HTTP status
  code: AppErrorCode;           // machine-readable, switch on THIS
  detail?: string;              // instance-specific human message
  instance?: string;            // offending path
  requestId: string;            // == OTel trace id, correlates across services
  errors?: FieldError[];        // present iff code === 'VALIDATION_FAILED'
  entitlementKey?: EntitlementKey; // present iff code === 'ENTITLEMENT_REQUIRED'
  retryAfterMs?: number;        // present on RATE_LIMITED / UPSTREAM_*
}
export interface FieldError { path: string; message: string; }

export type AppErrorCode =
  | 'AUTH_INVALID_TOKEN' | 'AUTH_DEVICE_UNBOUND' | 'AUTH_STEP_UP_REQUIRED'
  | 'FORBIDDEN_ROLE' | 'ENTITLEMENT_REQUIRED' | 'QUOTA_LIVE_MINUTES'
  | 'VALIDATION_FAILED' | 'IDEMPOTENCY_CONFLICT' | 'RATE_LIMITED'
  | 'NOT_FOUND' | 'CONFLICT' | 'UPSTREAM_STT' | 'UPSTREAM_LLM'
  | 'UPSTREAM_BILLING' | 'INTERNAL';
```

| Domain | `code` | HTTP | WS close | Meaning / client action |
|---|---|---|---|---|
| auth | `AUTH_INVALID_TOKEN` | 401 | 4401 | expired/invalid JWT → refresh then retry once |
| auth | `AUTH_DEVICE_UNBOUND` | 401 | 4401 | device not bound → re-run device binding |
| auth | `AUTH_STEP_UP_REQUIRED` | 401 | — | prompt TOTP → `POST /auth/step-up` → retry ([Auth §5.2](40-authentication.md)) |
| authz | `FORBIDDEN_ROLE` | 403 | 4403 | RBAC role insufficient → non-retryable |
| entitlement | `ENTITLEMENT_REQUIRED` | 403 | 4403 | feature not in plan; `entitlementKey` names the gate → upsell |
| quota | `QUOTA_LIVE_MINUTES` | 402 | 4402 | metered limit hit → upgrade or wait for reset |
| validation | `VALIDATION_FAILED` | 422 | 4400 | Zod failure; `errors[]` lists fields → fix + retry |
| idempotency | `IDEMPOTENCY_CONFLICT` | 409 | — | same key, different body → do not retry blindly |
| conflict | `CONFLICT` | 409 | — | state conflict (e.g. session already ended) |
| ratelimit | `RATE_LIMITED` | 429 | 4429 | bucket exhausted → honor `Retry-After`/`retryAfterMs` |
| resource | `NOT_FOUND` | 404 | — | missing or not owned (no existence leak) |
| upstream | `UPSTREAM_STT` / `UPSTREAM_LLM` | 502 | — | provider failed; may retry with backoff |
| upstream | `UPSTREAM_BILLING` | 502 | — | Stripe API failed → retry idempotently |
| internal | `INTERNAL` | 500 | 1011 | unexpected; correlate by `requestId` |

```jsonc
// 403 — entitlement gate (canonical shape)
{ "type": "https://errors.usecue.app/entitlement-required",
  "title": "Entitlement required", "status": 403, "code": "ENTITLEMENT_REQUIRED",
  "entitlementKey": "rag.upload", "detail": "RAG uploads require Pro or higher.",
  "instance": "/v1/documents", "requestId": "req_01J8Z…" }
```

---

## 5. WebSocket protocol — `cue.v1` (`ws-gateway`)

The realtime edge does **transport only** (audio up, cues/transcripts down); AI work is in [AI pipeline](21-ai-pipeline.md). Two channels over one socket: **binary frames = audio ingest** (client→server), **text frames = JSON control/data** (both ways). Types are shared verbatim with `desktop` via `packages/types/src/ws.ts`.

### 5.1 Connection lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant D as desktop
    participant API as api
    participant WS as ws-gateway
    participant R as Redis (control)
    participant AI as ai-orchestrator

    D->>API: POST /v1/sessions/:id/ws-ticket (Bearer JWT)
    API-->>D: { ticket (60s, single-use), wsUrl, protocol:"cue.v1" }
    D->>WS: WSS connect  (Sec-WebSocket-Protocol: cue.v1)
    Note over D,WS: ticket is NOT on the query string
    WS-->>D: 101 Switching Protocols (subprotocol cue.v1); auth deadline 5s
    D->>WS: FIRST msg {t:"hello", protocol, ticket, codec, sampleRate, resumeFrom?}
    WS->>R: SETNX ws:ticket:{jti} (one-time-use replay guard)
    WS->>WS: verify ticket sig + aud + exp; bind {userId,sessionId,deviceId}
    alt invalid / replayed / deadline missed
        WS-->>D: {t:"error", code} then close 4401/4400
    else valid
        WS->>AI: open gRPC bidi stream (SessionInit)
        WS-->>D: {t:"ready", sessionId, heartbeatSec:15, resumedFrom?}
        loop live
            D->>WS: binary audio frame (Opus 20ms)
            WS->>AI: AudioFrame (gRPC uplink)
            AI-->>WS: CueDelta / TranscriptPartial (gRPC downlink)
            WS-->>D: {t:"cue.delta"|"transcript.partial", …}
            WS->>R: write last-emitted offset (resume state)
        end
    end
    D->>WS: {t:"end"} or disconnect
    WS->>AI: half-close (finalize)
    WS-->>D: {t:"session.finalizing"} then close 1000
```

### 5.2 Auth handshake — first-message ticket (remediation-locked)

The JWT is never on the WS socket and the **ticket is never on the query string** (it would leak into proxy/access logs and browser history). Instead:

1. `api` mints a **single-use, 60s WS ticket** — a short ES256 JWT carrying `{ sub, sid: sessionId, did: deviceId, jti, aud:"ws-gateway", exp }`, signed by the KMS CMK ([Auth §2.3](40-authentication.md)).
2. The socket upgrades carrying only `Sec-WebSocket-Protocol: cue.v1`. The gateway starts a **5s auth deadline**; until the client's first message authenticates, no other frame (binary or JSON) is accepted.
3. The client's **first application message is the `hello`**, and it carries the `ticket`. The gateway verifies signature + `aud` + `exp`, then `SETNX ws:ticket:{jti}` in Redis (TTL = ticket TTL) to enforce **one-time use** (replay → `WS_TICKET_REPLAY`, close `4401`).
4. On success the connection is bound to `{userId, sessionId, deviceId}`; the gateway holds no long-lived credential and re-checks the live-minutes entitlement on connect and on a timer — an exhausted plan tears the stream down with `{t:"quota.exceeded"}` (§5.3).

> **Subprotocol alternative.** Where a client must authenticate *before* the first frame (e.g. an intermediary that buffers), the ticket MAY ride as a second `Sec-WebSocket-Protocol` token: `Sec-WebSocket-Protocol: cue.v1, ticket.<jwt>`. The gateway strips and validates it identically and echoes back only `cue.v1`. This is still header-carried, not query-string — the query string remains forbidden. First-message is the default.

### 5.3 Message schema

**Binary audio frame** — 4-byte little-endian header + payload; no JSON on the hot path.

```
byte 0    : frame type  (0x01 opus · 0x02 pcm16)
byte 1    : channel     (0x00 mixed · 0x01 mic · 0x02 loopback)
bytes 2-3 : sequence    (uint16, wraps; gap detection)
bytes 4..N: payload     (Opus packet | PCM16 chunk)
```

**JSON control/data envelope** — discriminated union on `t`, typed in `packages/types/src/ws.ts`:

```ts
// packages/types/src/ws.ts — shared by ws-gateway AND desktop
export type ClientMsg =
  | { t: 'hello'; protocol: 'cue.v1'; ticket: string;         // FIRST message; carries auth (§5.2)
      codec: 'opus' | 'pcm16'; sampleRate: 16000 | 48000; resumeFrom?: number }
  | { t: 'mute'; channel: 'mic' | 'loopback'; muted: boolean }
  | { t: 'ask'; prompt: string }                              // manual "cue now" nudge
  | { t: 'mode'; disclosed: boolean }                         // toggle disclosed mode mid-session
  | { t: 'heartbeat'; ts: number }
  | { t: 'end' };

export type ServerMsg =
  | { t: 'ready'; sessionId: string; heartbeatSec: number; resumedFrom?: number }
  | { t: 'transcript.partial'; speaker: Speaker; text: string; ts: number }
  | { t: 'transcript.final'; speaker: Speaker; seq: number; text: string; startMs: number; endMs: number }
  | { t: 'cue.delta'; cueId: string; text: string }           // streamed token chunk
  | { t: 'cue.final'; cueId: string; seq: number; text: string; model: LiveModel }
  | { t: 'entitlements.updated'; version: number }            // push after a billing change (Entitlements §4.5)
  | { t: 'backpressure'; level: 'ok' | 'shed' }               // ask client to slow audio (§5.5)
  | { t: 'quota.exceeded'; remainingMs: 0 }
  | { t: 'heartbeat'; ts: number }
  | { t: 'error'; code: WsErrorCode; message: string }
  | { t: 'session.finalizing' };

export type Speaker = 'them' | 'me' | 'unknown';
export type LiveModel = 'haiku-4-5' | 'sonnet-5';
export type WsErrorCode =
  | 'WS_TICKET_INVALID' | 'WS_TICKET_EXPIRED' | 'WS_TICKET_REPLAY'
  | 'WS_AUTH_TIMEOUT' | 'WS_PROTOCOL_UNSUPPORTED' | 'WS_RESUME_EXPIRED'
  | 'WS_BACKPRESSURE' | 'QUOTA_LIVE_MINUTES';
```

WS close codes: `1000` normal · `1001` heartbeat miss ×2 · `1011` internal · `1013` backpressure shed · `4400` bad/late auth frame · `4401` ticket invalid/replay · `4402` quota · `4403` forbidden/entitlement · `4429` rate-limited.

### 5.4 Heartbeat, backpressure & resume

- **Heartbeat.** App-level `heartbeat` every **15s** each way (independent of TCP/WS ping so a half-open app is detected). Miss 2 → server closes `1001`.
- **Backpressure.** Ingest: the gateway watches gRPC/HTTP2 flow-control + per-session buffer depth; over threshold it emits `{t:"backpressure", level:"shed"}` and the client drops to a lower-bitrate Opus profile and VAD-gated frames — audio is never buffered unbounded server-side. Egress: `transcript.partial` frames are coalesced (keep latest, drop superseded) rather than growing the queue — partials are disposable, `*.final` are not. Per-connection in-flight cap → close `1013` (`WS_BACKPRESSURE`).
- **Resume via offsets.** Every `*.final` carries a monotonic `seq`; the gateway persists the last-emitted `seq` per session in Redis (control state, 60s grace). On reconnect the client sends `hello` with `resumeFrom:<lastSeq>`; the gateway replays only missed `cue.final`/`transcript.final` (never re-streams partials) and answers `ready` with `resumedFrom`. Past the grace window → `WS_RESUME_EXPIRED`, client starts a fresh session. A fresh single-use ticket is required for every (re)connect. The gateway is stateless across restarts — offsets live in Redis — so an ECS task replacement drains and clients reconnect transparently ([Backend services §6.5](20-backend-services.md)).

---

## 6. gRPC contract — `ws-gateway ↔ ai-orchestrator`

The internal hot-path hop is **gRPC bidirectional streaming over HTTP/2** (typed, low-latency); Redis is off the per-frame path ([decision record A01](04-decision-record.md)). One long-lived `Stream` RPC per live session: audio + control up, transcript + cue + usage down. Same-region/AZ placement keeps this hop single-digit-millisecond ([System arch §4.1](02-system-architecture.md)). The `.proto` is the source of the generated internal DTOs in `packages/types/src/internal/orchestrator.ts` (§9).

```proto
syntax = "proto3";
package cue.orchestrator.v1;

service Orchestrator {
  // Bidi: ws-gateway sends init + audio + control; ai-orchestrator streams transcript + cues + usage.
  rpc Stream(stream ClientEnvelope) returns (stream ServerEnvelope);
}

message ClientEnvelope {
  oneof kind {
    SessionInit init  = 1;   // MUST be the first message on the stream
    AudioFrame  audio = 2;
    Control     control = 3;
  }
}
message SessionInit {
  string session_id = 1;
  string org_id     = 2;
  string user_id    = 3;
  string data_region = 4;               // 'us' | 'eu' (residency pin)
  repeated string document_ids = 5;     // RAG context scope
  AudioFormat format = 6;
  bool disclosed = 7;
  uint32 resume_from_seq = 8;           // 0 = fresh; >0 = replay after this seq
}
message AudioFormat { Codec codec = 1; uint32 sample_rate = 2; }
enum Codec { CODEC_UNSPECIFIED = 0; OPUS = 1; PCM16 = 2; }

message AudioFrame {
  Channel channel = 1;                  // MIXED | MIC | LOOPBACK
  uint32 sequence = 2;                  // mirrors the binary WS header seq
  bytes  payload  = 3;                  // Opus packet | PCM16 chunk
  int64  captured_at_ms = 4;            // client capture ts for latency attribution
}
enum Channel { CHANNEL_UNSPECIFIED = 0; MIXED = 1; MIC = 2; LOOPBACK = 3; }

message Control {
  oneof kind {
    Mute mute = 1;      // { Channel channel; bool muted }
    Ask  ask  = 2;      // { string prompt }
    Mode mode = 3;      // { bool disclosed }
    End  end  = 4;      // half-close signal (finalize)
  }
}
message Mute { Channel channel = 1; bool muted = 2; }
message Ask  { string prompt = 1; }
message Mode { bool disclosed = 1; }
message End  {}

message ServerEnvelope {
  oneof kind {
    Ready             ready      = 1;
    TranscriptPartial partial    = 2;
    TranscriptFinal   final      = 3;
    CueDelta          cue_delta  = 4;
    CueFinal          cue_final  = 5;
    UsageTick         usage      = 6;   // async minutes/tokens → entitlements meter
    Backpressure      backpressure = 7;
    StreamError       error      = 8;
  }
}
message Ready { uint32 resumed_from_seq = 1; }
message TranscriptPartial { Speaker speaker = 1; string text = 2; int64 ts_ms = 3; }
message TranscriptFinal   { Speaker speaker = 1; uint32 seq = 2; string text = 3; int64 start_ms = 4; int64 end_ms = 5; uint32 confidence = 6; }
message CueDelta { string cue_id = 1; string text = 2; }
message CueFinal { string cue_id = 1; uint32 seq = 2; string text = 3; Model model = 4; }
message UsageTick { uint32 active_seconds = 1; uint64 llm_input_tokens = 2; uint64 llm_output_tokens = 3; }
message Backpressure { bool shed = 1; }
message StreamError { string code = 1; string message = 2; bool retryable = 3; }  // maps to WsErrorCode / AppErrorCode

enum Speaker { SPEAKER_UNSPECIFIED = 0; THEM = 1; ME = 2; }
enum Model   { MODEL_UNSPECIFIED = 0; HAIKU_4_5 = 1; SONNET_5 = 2; }
```

The gateway translates 1:1 between WS frames (§5.3) and these envelopes: a binary WS audio frame → `AudioFrame`; `CueDelta`/`CueFinal` → `{t:"cue.delta"}`/`{t:"cue.final"}`; `StreamError.retryable` selects the WS close code. `UsageTick` is emitted async to the `entitlements` meter and never blocks the cue path ([Entitlements §6](50-subscriptions-entitlements.md)).

---

## 7. Shared DTO contract — `packages/types` (codegen from Zod)

`packages/types` is the single source of truth for every shape that crosses a process boundary. Two **non-overlapping** generation axes, both CI drift-checked ([decision record A09](04-decision-record.md)):

| Axis | Source of truth | Generated into | Consumers |
|---|---|---|---|
| **HTTP/wire DTOs** | `api` **Zod schemas** (`z.infer`) | `packages/types/src/http/*` | `sdk`, `desktop`, `web` |
| **WS envelope** | hand-authored union in `ws.ts` (shared verbatim) | `packages/types/src/ws.ts` | `ws-gateway`, `desktop` |
| **gRPC internal DTOs** | `.proto` (§6) via `ts-proto` | `packages/types/src/internal/orchestrator.ts` | `ws-gateway`, `ai-orchestrator` |
| **DB row types** | Drizzle schema (`InferSelectModel`) | `packages/types/src/db.ts` | `api`, repositories ([Data model §4](30-data-model.md)) |

```text
packages/types/src/
├── http/            # GENERATED from api Zod — do not hand-edit
│   ├── sessions.ts  documents.ts  orgs.ts  entitlements.ts  billing.ts
│   └── errors.ts    # ProblemDetails + AppErrorCode (§4)
├── ws.ts            # ClientMsg / ServerMsg union + binary frame consts (§5.3)
├── internal/orchestrator.ts   # GENERATED from proto (§6)
├── domain/          # shared enums: SessionKind, Speaker, Plan, Role, EntitlementKey
└── db.ts            # GENERATED from Drizzle
```

**Canonical direction — schema is the runtime validator AND the type source.** The `api` Zod schema validates the boundary at runtime; `z.infer` emits the static DTO. Types can never drift from validation because they share one origin.

```ts
// services/api/src/modules/sessions/dto/create-session.schema.ts  (SOURCE OF TRUTH)
import { z } from 'zod';
export const CreateSessionSchema = z.object({
  kind: z.enum(['interview_prep', 'interview_live', 'sales', 'support', 'meeting_notes']),
  title: z.string().min(1).max(200),
  disclosed: z.boolean().default(false),
  documentIds: z.array(z.string().startsWith('doc_')).max(20).default([]),
  language: z.string().length(2).default('en'),
});

// codegen step emits → packages/types/src/http/sessions.ts (GENERATED)
export type CreateSessionDto = z.infer<typeof CreateSessionSchema>;
```

**CI drift check.** `turbo run codegen:check` regenerates `http/*` (from Zod), `internal/*` (from `.proto`), and `db.ts` (from Drizzle) into a temp dir and `git diff --exit-code`s against the committed output. Any divergence fails the build — validators, wire types, DB types, and the gRPC contract stay locked together across the whole Turbo graph.

```yaml
# .github/workflows/ci.yml (excerpt)
- run: pnpm turbo run codegen:check   # fails if committed DTOs ≠ regenerated from schemas
- run: pnpm turbo run typecheck       # breaking a shared type fails every dependent package
```

> Generated files are exempt from the 700-LOC house rule but stay split per resource; the ESLint boundary rule ([Repo structure §4](03-repository-structure.md)) forbids any service redefining another's shape or deep-importing across features.

---

## 8. SDK surface — `packages/sdk`

The generated-thin typed client wraps `packages/types`; it adds transport, auth refresh (401 → refresh → retry once), retries/backoff, `problem+json` parsing, and idempotency-key generation, so no caller hand-writes `fetch`.

```ts
// packages/sdk/src/resources/sessions.ts
import type { CreateSessionDto, Session, WsTicket, Paginated } from '@cue/types';

export class SessionsResource {
  constructor(private readonly http: HttpClient) {}
  create(body: CreateSessionDto, opts?: { idempotencyKey?: string }): Promise<Session> {
    return this.http.post('/v1/sessions', body, { idempotency: true, ...opts });
  }
  wsTicket(sessionId: string): Promise<WsTicket> {
    return this.http.post(`/v1/sessions/${sessionId}/ws-ticket`, undefined, { idempotency: true });
  }
  list(q?: { cursor?: string; limit?: number }): Promise<Paginated<Session>> {
    return this.http.get('/v1/sessions', { query: q });
  }
}
```

The pagination envelope `Paginated<T>` is the single response wrapper for every list endpoint (§10.3):

```ts
// packages/types/src/http/pagination.ts
export interface Paginated<T> { data: T[]; nextCursor: string | null; hasMore: boolean; }
```

---

## 9. Versioning, idempotency & pagination

### 9.1 Versioning

- **HTTP:** URL-versioned `/v1`. Additive-only within a major (new optional fields, new endpoints). Breaking changes ship `/v2` with an overlap window; `/v1` then returns `Deprecation: <date>` + `Sunset: <date>` headers. Enum values are additive; clients must tolerate unknown enum members.
- **WS:** the `hello`/`ready` handshake negotiates `protocol:"cue.v1"`; the gateway supports **N and N-1** during a rollout so auto-updated desktop clients on either version connect. Unknown protocol → `WS_PROTOCOL_UNSUPPORTED`, close `4400`.
- **gRPC:** `package cue.orchestrator.v1`; field numbers are immutable, additions are new field numbers only (proto3 back-compat). Both services deploy from the same monorepo commit, so the contract is version-locked by the Turbo graph.
- **SDK:** semver'd against the API major; the desktop app pins a compatible SDK range.

### 9.2 Idempotency

- Every unsafe mutation accepts an `Idempotency-Key` (UUIDv4) header; the SDK generates and persists one per logical mutation so a retry after a network blip does not double-create.
- A NestJS interceptor stores `key → {status, responseHash, body}` in Redis (TTL 24h) keyed by `{userId, route, key}`. Replay with same key + same body → the stored response; same key + **different** body → `409 IDEMPOTENCY_CONFLICT`.
- `POST /webhooks/stripe` and BullMQ jobs are idempotent by their own natural keys (Stripe `event.id`, job idempotency key) — [Backend services §7](20-backend-services.md), [Entitlements §6.2](50-subscriptions-entitlements.md). WS ticket mint is idempotent so a client retry does not burn two single-use tickets.

### 9.3 Pagination

- Cursor-based only: `?cursor=<opaque>&limit=<1..100>` (default 20, max 100). The cursor is a base64url of `{ lastId, lastSortKey }` — never an offset (offsets drift under concurrent writes and leak row counts).
- Every list returns the `Paginated<T>` envelope (§8); `nextCursor` is `null` iff `hasMore` is `false`. Cursors are opaque and single-direction (forward); clients must not construct or mutate them.
- List queries are `org_id`-scoped by RLS ([Data model §8](30-data-model.md)); a cursor from one org context is rejected `NOT_FOUND` if replayed under another.

### 9.4 Rate limiting

Redis token buckets on two dimensions — **per-user** (authenticated) and **per-IP** (pre-auth `/auth/*`) — tier-aware via `entitlements`. `429` carries `Retry-After` + `RateLimit-Limit`/`RateLimit-Remaining`/`RateLimit-Reset`, and `problem+json` with `retryAfterMs`. The realtime path is limited by **concurrent sessions per user** (enforced at ticket mint) and **live-minutes** (metered), not RPS ([Backend services §9.2](20-backend-services.md), [Entitlements §6.3](50-subscriptions-entitlements.md)).

---

## Open questions & risks

1. **WS auth-deadline vs. reconnect latency.** The 5s first-message auth deadline (§5.2) plus a fresh single-use ticket per reconnect adds ~1 RTT to every resume. If field data shows this hurts reconnection UX on lossy links, evaluate a short grace re-auth using the prior ticket's `jti` lineage — reconciled against the replay-guard invariant ([Backend services OQ#2](20-backend-services.md)).
2. **Ticket in subprotocol leakage surface.** The subprotocol fallback (§5.2) still places the ticket in a request header; confirm no intermediary logs `Sec-WebSocket-Protocol` and prefer first-message wherever the client stack allows it.
3. **`ENTITLEMENT_REQUIRED` migration.** Canonicalizing the code (§4) means updating the `RequireEntitlementGuard` (`ENTITLEMENT_DENIED` today, [Entitlements §5.1](50-subscriptions-entitlements.md)) and the illustrative `ENTITLEMENT_RAG_UPLOAD` in [Backend services §10](20-backend-services.md); needs a coordinated edit + a lint rule banning ad-hoc entitlement codes.
4. **Zod-first codegen for polymorphic responses.** `z.infer` on discriminated unions and recursive schemas can widen types; verify the `http/*` generator preserves the discriminant literal narrowing the WS `ws.ts` union relies on, or the two surfaces diverge subtly.
5. **gRPC stream vs. WS resume seq alignment.** Resume replays by `seq` from Redis (§5.4) while the gRPC stream is torn down on gateway restart; confirm `ai-orchestrator` can re-establish `resume_from_seq` context without re-running STT — coordinate the finalize/replay contract with [AI pipeline](21-ai-pipeline.md).
6. **Cursor stability under envelope-encryption.** List sort keys must be plaintext columns (ids/timestamps), never enveloped content ([Data model §9.4](30-data-model.md)); audit that no future list endpoint sorts on an encrypted field, which would break cursor determinism.
7. **`/v1`→`/v2` overlap for auto-updating desktop.** The desktop update cadence is independent of the backend; the deprecation window must exceed the slowest realistic client update lag — set a concrete `Sunset` horizon with [DevOps](60-devops-infrastructure.md).
