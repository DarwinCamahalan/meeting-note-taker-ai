# Packages Reference (`packages/*`)

> **For future AI:** This is the as-built per-package reference for the 7 shared
> libraries under `packages/`. Everything here was read from the real source on
> the `dev` branch — where something is a stub or TODO it is called out
> explicitly. Scope is `@cue/*`; all packages are `"private": true`, ESM
> (`"type": "module"`), TypeScript strict, and build with `tsc` to `dist/`.
> Sibling docs: [services](./services.md), [apps](./apps.md),
> [monorepo map](../02-monorepo-map.md),
> [architecture](../01-architecture-as-built.md),
> [conventions](../06-conventions.md), [TODOs & gaps](../07-todos-and-gaps.md).

## At a glance

| Package | Responsibility | Key exports |
|---|---|---|
| [`@cue/config`](#cueconfig) | Canonical shared tsconfig base + flat ESLint + Prettier for the whole monorepo | (config files, not JS symbols): `tsconfig.base.json`, `./eslint`, `./prettier` |
| [`@cue/types`](#cuetypes) | Single source of truth for cross-process/cross-service contracts (IPC, HTTP/WS, billing, documents, SSO, admin/RBAC) | `IpcApi`, `AudioChunk`, `CueEvent`, `ProblemDetails`, `Plan`, `ClientMsg`/`ServerMsg`, `Entitlement`, `Document`, `SsoConnection`, `Permission` |
| [`@cue/core`](#cuecore) | The AI pipeline: Deepgram STT → Claude streaming cues + orchestrator + RAG + reliability | `CueOrchestrator`, `createOrchestrator`, `DeepgramSttClient`, `ClaudeCueClient`, `VoyageEmbeddingsClient`, `Retriever`, `chunkText`, `DegradationController`, `NotImplementedLoopbackCapture` |
| [`@cue/db`](#cuedb) | Drizzle schema (Postgres 16 + pgvector), typed pg client, migrations | `createDb`, `getDb`, schema tables (`orgs`…`invitations`), inferred row types (`User`, `Session`, `Document`…) |
| [`@cue/proto`](#cueproto) | `cue.orchestrator.v1` gRPC contract + typed proto-loader client/server wrappers | `createOrchestratorClient`, `addOrchestratorService`, `loadOrchestratorProto`, envelope types |
| [`@cue/sdk`](#cuesdk) | Typed fetch client for the `api` REST/auth contract (refresh-on-401, problem+json) | `CueApiClient`, resource classes (`AuthResource`…`AdminResource`), `CueApiError` |
| [`@cue/observability`](#cueobservability) | OTel tracing, pino logging (PII-redacted), Prometheus SLIs, Sentry, health, NestJS module, circuit-breaker/backoff | `initTracing`, `createLogger`, `MetricsRegistry`, `HealthRegistry`, `CircuitBreaker`, `retry`, `ObservabilityModule` |

### Workspace dependency graph

```mermaid
graph TD
  config[@cue/config]
  types[@cue/types]
  obs[@cue/observability]
  core[@cue/core]
  db[@cue/db]
  proto[@cue/proto]
  sdk[@cue/sdk]

  core --> types
  core --> obs
  sdk --> types
  config -. dev/lint only .-> types
  config -. dev/lint only .-> core
  config -. dev/lint only .-> db
  config -. dev/lint only .-> proto
  config -. dev/lint only .-> sdk
  config -. dev/lint only .-> obs
```

Only two runtime workspace edges exist: `@cue/core → {@cue/types, @cue/observability}`
and `@cue/sdk → @cue/types`. `@cue/db` and `@cue/proto` have **no** workspace
runtime deps (only third-party). `@cue/config` is a dev/lint dependency of
every other package. Services and apps consume these; see
[services.md](./services.md) / [apps.md](./apps.md).

### Common commands

Every publishable package (all except `@cue/config`) exposes the same scripts:

```bash
pnpm --filter @cue/<name> build       # tsc -p tsconfig.json → dist/
pnpm --filter @cue/<name> typecheck   # tsc --noEmit
pnpm --filter @cue/<name> lint        # eslint .
```

`@cue/config` ships no build (it is the config). `@cue/db` and `@cue/proto` add
extra scripts (see their sections). Build the whole graph via Turborepo from the
repo root — see [05-setup-and-run.md](../05-setup-and-run.md).

---

## `@cue/config`

**Path:** `packages/config/` · **Purpose:** the *canonical* single source of
lint/format/compiler config for the monorepo (per the "one tsconfig base"
decision record). Every package/app extends this and overrides only
`module`/`lib`/`jsx`.

### Key files

| File | What it is |
|---|---|
| `tsconfig.base.json` | The one base tsconfig. `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax` + `isolatedModules`, `target ES2022`, `module ESNext`, `moduleResolution Bundler`, declaration/sourcemaps on. |
| `eslint.config.js` | Flat ESLint 9 config (`typescript-eslint` recommended-type-checked). Bans `no-explicit-any` (error), enforces inline type-imports, `^_` ignore for unused. Ends with `eslint-config-prettier`. |
| `prettier.config.js` | `semi`, `singleQuote`, `trailingComma: all`, `printWidth 100`, `tabWidth 2`, `arrowParens: always`, `endOfLine: lf`. |

### Exports (subpath, not JS symbols)

```jsonc
"./tsconfig.base.json" → tsconfig.base.json
"./eslint"             → eslint.config.js     // import cueConfig from '@cue/config/eslint'
"./prettier"           → prettier.config.js
```

- **Dependencies:** `@eslint/js`, `eslint-config-prettier`, `globals`,
  `typescript-eslint`; peers `eslint`/`prettier`/`typescript`.
- **Build/run:** none — pure config files listed under `"files"`.
- **Real vs stub:** fully real; consumed by every other project.

---

## `@cue/types`

**Path:** `packages/types/` · **Purpose:** the single source of truth for every
contract that crosses a process/service boundary. Plain data only (no class
instances) so it survives Electron structured-clone IPC and JSON transport.
Split by phase so early modules stay minimal.

### Key files & their surface

| File | Contracts | Notable exports |
|---|---|---|
| `src/index.ts` | Phase 0 IPC + pipeline; re-exports all other modules | `SessionState`, `AudioChunk`, `TranscriptEvent`, `CueEvent`, `AuthStatus`, `AuthState`, `AuthUserSummary`, **`IpcApi`** (the `window.cue` contextBridge surface) + a `declare global { interface Window { cue: IpcApi } }` |
| `src/api.ts` | Phase 1 HTTP/WS contract | `Plan`, `DataRegion`, `OrgRole`, `SessionKind`/`SessionStatus`, `LiveModel`, PKCE DTOs (`PkceStartRequest/Response`, `PkceExchangeRequest`, `AuthTokens`, `RefreshRequest`), `User`/`Org`/`MeResponse`, `Session`, `WsTicket`, `Paginated<T>`, `AppErrorCode`, **`ProblemDetails`** (RFC 9457), WS envelopes `ClientMsg`/`ServerMsg`, `WsErrorCode`, `WS_AUDIO_FRAME` |
| `src/billing.ts` | Phase 2 monetization | `PlanTier`, `BillingInterval`, `PlanTierConfig`, `EntitlementKey`, `Entitlement`, `EntitlementsResponse`, `REQUIRE_ENTITLEMENT_METADATA_KEY`, `Subscription`, `CheckoutSessionRequest/Response`, `PortalLinkResponse`, `StripeWebhookEventType`, `UsageEnforcementState`, `UsageSummary` |
| `src/documents.ts` | Phase 2 RAG DTOs | `Document`, `DocumentUploadRequest/Response`, `DocumentChunk`, `RagChunkMatch`, `RagRetrievalResult` |
| `src/sso.ts` | Phase 3 enterprise SSO/SCIM (WorkOS) | `SsoProvider`, `SsoConnectionStatus`, `SsoConnection`, `CreateSsoConnectionRequest`, `SsoAuthorizeRequest/Response`, `SsoCallbackResult`, `ScimEventType` |
| `src/admin.ts` | Phase 3 RBAC + org admin | `Role`, **`Permission`**, `RbacRequirement`, `REQUIRE_ROLE_METADATA_KEY`, `InviteStatus`, `OrgInvite`, `CreateInviteRequest`, `AcceptInviteRequest`, `AdminMemberView`, `UpdateMemberRequest`, `OrgSettings`, `UpdateOrgSettingsRequest`, `AuditAction`, `AuditLogEntry`, `ListAuditLogsQuery`, `SeatSummary` |

- **Dependencies:** none at runtime (types only). Dev: `@cue/config`,
  `typescript`.
- **Consumed by:** `@cue/sdk`, `@cue/core` (imports `AudioChunk`/`CueEvent`/etc.),
  `services/api`, `services/ws-gateway`, `apps/desktop`, `apps/web`.
- **Real vs stub:** fully real; these are declarations, no runtime logic. Note
  the two `*_METADATA_KEY` string consts are used as NestJS decorator metadata
  keys by the api's guards.

---

## `@cue/core`

**Path:** `packages/core/` · **Purpose:** the runnable AI pipeline — Deepgram
streaming STT → Claude streaming cue generation, wired by the
`CueOrchestrator`, plus the Phase 2 RAG layer and the Phase 4 reliability layer.
This is the brain that both the Electron main process (local path) and
`services/ai-orchestrator` (backend path) drive.

### Layout & key files

| Dir/file | Role | Key exports |
|---|---|---|
| `src/types.ts` | Pipeline/config/context contracts | `CuePipeline`, `OrchestratorConfig`, `RagConfig`, `ReliabilityConfig`, `CueContext`, `CueRagContext` |
| `src/stt/deepgram-client.ts` | Live STT over Deepgram websocket | `DeepgramSttClient`, `DeepgramSttOptions`. Live schema: `nova-2`, 16 kHz mono `linear16`, `interim_results`, `endpointing: 300`. Queues up to `MAX_PENDING_CHUNKS` (200) before socket open. |
| `src/llm/claude-cue-client.ts` | Streaming cue generation over Claude | `ClaudeCueClient`, `ClaudeCueOptions`, `CueStreamOverrides`, `STABLE_SYSTEM_PROMPT`, `NONE_SENTINEL` (`<none>`), `SESSION_RAG_HEADER`. Default model **`claude-haiku-4-5`**, thinking OFF for low latency; supports two `cache_control: ephemeral` system blocks when a session-RAG block is present. |
| `src/orchestrator/context.ts` | Rolling-transcript assembler (~30s window) | `RollingTranscript` |
| `src/orchestrator/cue-orchestrator.ts` | Wires STT→LLM into the end-to-end thread; supersedes in-flight cues via `AbortController`; drives state machine; opt-in RAG (one retrieval/session, `DEFAULT_RAG_BUDGET_MS = 400`) and opt-out reliability | **`CueOrchestrator`** (implements `CuePipeline`), **`createOrchestrator(cfg)`** factory |
| `src/embeddings/voyage-client.ts` | Voyage embeddings client | `VoyageEmbeddingsClient`, `VoyageEmbeddingsOptions`, `VoyageEmbeddingsError`, `VoyageInputType`, `VOYAGE_EMBEDDING_MODEL` (`voyage-3.5`), `VOYAGE_EMBEDDING_DIMENSIONS` (`1024`), `FetchLike`. Batches at 128, injectable fetch. |
| `src/rag/chunker.ts` | Pure token-aware text chunker | `chunkText`, `estimateTokens`, `ChunkOptions`, `TextChunk` |
| `src/rag/retriever.ts` | DB-agnostic vector retrieval over a port | `Retriever`, `VectorSearchPort`, `VectorSearchParams`, `RetrieverOptions`, `RetrievalQuery`; re-exports `RagChunkMatch`, `RagRetrievalResult` |
| `src/rag/context-provider.ts` | Orchestrator-facing seam + pure serialization | `RagContextProvider` (interface/seam), `trimMatches`, `serializeMatches`, `SESSION_RAG_BUDGET` (1500), `HOT_RAG_BUDGET` (600) |
| `src/reliability/degradation.ts` | Graceful-degradation ladder (docs/70 §5.3) | `DegradationController`, `LlmDegradation` (`normal`/`reduced`/`shedding`), `SttDegradation` (`primary`/`failover`/`unavailable`), `DegradationTuning`, `DegradationChange`, `DegradationSnapshot`, `TUNING_BY_LEVEL`, `DegradationOptions` |
| `src/reliability/resilient-stt-client.ts` | STT wrapper (breaker + backoff, never hang) | `ResilientSttClient`, `SttClient`, `SttClientFactory`, `ResilientSttOptions` |
| `src/reliability/resilient-cue-client.ts` | LLM wrapper (breaker + backoff; never retry the live cue) | `ResilientCueClient`, `CueLlmClient`, `LlmProviderError`, `ResilientCueOptions` |
| `src/audio/loopback.ts` | System-audio (far-side) capture interface | `LoopbackCapture` (interface), **`NotImplementedLoopbackCapture`** — see stub note |

### Public entry (`src/index.ts`)

Barrel re-exporting: pipeline types → STT client → Claude client → rolling
transcript → orchestrator (+ factory) → loopback; then Phase 2 RAG (voyage /
chunker / retriever / context-provider); then Phase 4 `reliability/index.js`.

- **Dependencies:** `@anthropic-ai/sdk` `^0.65`, `@deepgram/sdk` `^3.9`,
  workspace `@cue/types`, `@cue/observability` (the reliability wrappers use its
  `CircuitBreaker`/`retry`). Dev: `@cue/config`, `@types/node`, `typescript`.
- **Real vs stub:**
  - **Real:** STT client, Claude client, orchestrator, rolling transcript,
    Voyage client, chunker, retriever, context-provider, degradation ladder,
    resilient wrappers.
  - **STUB — loopback capture.** `NotImplementedLoopbackCapture.isSupported =
    false` and `start()` **throws** by design. There is **no** native
    ScreenCaptureKit (macOS) / WASAPI (Windows) binding. The comment ties this
    to the **descoped consent / recording-disclosure work** — do not implement
    without that. The *working* Phase 0 audio path is **mic-only**, captured in
    the renderer (`getUserMedia → AudioWorklet → window.cue.sendAudioChunk`),
    not here.
  - **Seam, not adapter:** `RagContextProvider` and `VectorSearchPort` are
    interfaces. `@cue/core` does not talk to Postgres; the concrete pgvector
    adapter lives in `services/ai-orchestrator` / `services/api`. See
    [07-todos-and-gaps.md](../07-todos-and-gaps.md).

---

## `@cue/db`

**Path:** `packages/db/` · **Purpose:** AssistMe's data layer — the Drizzle schema
(Postgres 16 + pgvector), a typed pg-backed client, and SQL migrations. Drizzle
is the single source of truth for DB row types (docs/30 §4).

### Schema (`src/schema/`) — 15 tables

| File | Tables | Enums |
|---|---|---|
| `_shared.ts` | — (shared helpers) | `primaryId()` (uuidv7 PK), `timestamps`, `softDelete`, `dataRegionEnum`, `planEnum`, `orgRoleEnum`, `sessionModeEnum`, `sessionStatusEnum`, `documentKindEnum`, `documentVisibilityEnum`, `documentStatusEnum`, `usageKindEnum` |
| `identity.ts` | `orgs`, `users`, `orgMembers`, `devices` | |
| `sessions.ts` | `sessions`, `transcripts`, `transcriptSegments` | |
| `documents.ts` | `documents`, `documentChunks` (`embedding vector(1024)`) | |
| `billing.ts` | `subscriptions`, `entitlements`, `usageEvents` | |
| `audit.ts` | `auditLogs` | |
| `enterprise.ts` | `ssoConnections`, `invitations` | `ssoProviderEnum`, `ssoConnectionStatusEnum`, `inviteStatusEnum` |

`src/schema/index.ts` is the barrel `drizzle.config.ts` and `client.ts` point at.

### Client & types

- `src/client.ts`: `createDb(opts)` → `{ db, pool }`, `getDb()` / `getPool()`
  singletons, types `Schema`, `Database` (`NodePgDatabase<Schema>`),
  `CreateDbOptions`.
- `src/types.ts`: inferred select/insert row types for every table —
  `Org`/`NewOrg`, `User`/`NewUser`, `OrgMember`, `Device`, `Session`,
  `Transcript`, `TranscriptSegment`, `Document`, `DocumentChunk` (embedding
  omitted from the select type), `Subscription`, `Entitlement`, `UsageEvent`,
  `AuditLog`, `SsoConnection`, `Invitation` (+ `New*` inserts).

### Migrations (`migrations/`)

| Tag | Contents |
|---|---|
| `0000_init.sql` | `CREATE EXTENSION vector`, `pgcrypto`; 13 tables (orgs…audit_logs); HNSW index `chunks_embedding_hnsw` on `document_chunks.embedding` (`vector_cosine_ops`, `m=16, ef_construction=64`); region/user/session/purge indexes |
| `0001_enterprise.sql` | `sso_connections`, `invitations` (+ their indexes) |
| `0002_team_kb.sql` | Team shared-KB additions (Phase 3), incl. `documents_org_visibility_idx` — extends `documents` for org-visible KB, no new table |

> **Note:** the task brief mentions "migrations 0000/0001"; the tree actually
> has a third, **`0002_team_kb`** (Phase 3), tracked in `meta/_journal.json`.

- **Exports:** `createDb`, `getDb`, `getPool`, all schema tables/enums, all row
  types. Subpath `@cue/db/schema` exposes the schema barrel alone.
- **Dependencies:** `drizzle-orm` `^0.36`, `pg` `^8.13`. Dev: `drizzle-kit`,
  `@types/pg`, `@cue/config`.
- **Scripts:** `build`, `typecheck`, `lint`, plus `db:generate`, `db:migrate`,
  `db:push`, `db:studio` (drizzle-kit).
- **Real vs stub:** schema/types/migrations fully real. Requires a running
  Postgres 16 with the `vector` extension; there is no seed data.

---

## `@cue/proto`

**Path:** `packages/proto/` · **Purpose:** the gRPC contract between
`services/ws-gateway` and `services/ai-orchestrator` — one `.proto` plus typed
`@grpc/proto-loader` client/server wrappers.

### Key files

- `src/orchestrator.proto` — package `cue.orchestrator.v1`, single service
  `Orchestrator` with one bidi-streaming RPC:
  `rpc Stream(stream ClientEnvelope) returns (stream ServerEnvelope)`. Messages:
  `ClientEnvelope` (`StartSession` | `AudioChunk` | `StopSession`),
  `ServerEnvelope` (`Transcript` | `Cue` | `State`), `AudioFormat`.
- `src/index.ts` — loader + typed wrappers.

### Exports (`src/index.ts`)

- Constants/options: `PROTO_PATH`, `PROTO_LOADER_OPTIONS`.
- Enum string-literal types: `Codec`, `Channel`, `SessionMode`, `SessionState`,
  `TranscriptKind`, `CueKind`, `Speaker`, `Model`.
- Message types: `AudioFormat`, `StartSession`, `AudioChunk`, `StopSession`,
  `ClientEnvelope`, `Transcript`, `Cue`, `State`, `ServerEnvelope`.
- Client/server: `OrchestratorClient`, `OrchestratorHandlers`,
  `loadOrchestratorProto()`, `getOrchestratorService()`,
  **`createOrchestratorClient(...)`**, **`addOrchestratorService(server, impl)`**.

- **Dependencies:** `@grpc/grpc-js` `^1.12`, `@grpc/proto-loader` `^0.7.13`.
  No workspace runtime deps.
- **Build:** `tsc` then copies `orchestrator.proto` into `dist/` (the loader
  resolves it at runtime via `PROTO_PATH`). Subpath
  `@cue/proto/orchestrator.proto` exposes the raw file.
- **Real vs stub:** fully real. It defines HAIKU_4_5 / SONNET_5 model enums and
  the mixed/mic/loopback channel enum — note the loopback channel exists in the
  wire contract even though `@cue/core` has no loopback capture implementation.

---

## `@cue/sdk`

**Path:** `packages/sdk/` · **Purpose:** the typed fetch client for the `api`
BFF. Wraps `@cue/types` with transport, bearer auth, problem+json parsing,
idempotency-key generation, and automatic **refresh-on-401** (refresh once, then
replay the original request).

### Key files & exports

| File | Exports |
|---|---|
| `src/index.ts` | **`CueApiClient`**, `CueApiClientOptions`; re-exports the resources, `CueApiError`, `isProblemDetails`, `HttpClient`, `FetchLike`/`HttpClientOptions`/`RequestOptions` |
| `src/http-client.ts` | `HttpClient`, `HttpClientOptions`, `RequestOptions`, `FetchLike`. Owns `getToken`/`onUnauthorized`, default headers, injectable fetch |
| `src/resources.ts` | `AuthResource`, `SessionsResource`, `UsersResource`, `DocumentsResource`, `BillingResource`, `SsoResource`, `AdminResource` |
| `src/errors.ts` | `CueApiError`, `isProblemDetails(value)` type guard |

`CueApiClient` exposes `auth`, `sessions`, `documents`, `billing`, `sso`,
`admin` resources plus `me()`, `setTokens`/`clearTokens`/`getTokens`. The
`handleUnauthorized` path refreshes once (guards reentrancy) and clears tokens
on failure.

- **Dependencies:** workspace `@cue/types` only. Dev: `@cue/config`,
  `@types/node`, `typescript`. No third-party runtime deps — uses global
  `fetch` (overridable).
- **Consumed by:** `apps/desktop` (main-process auth/session), `apps/web`.
- **Real vs stub:** fully real; a thin, complete transport over the api contract.

---

## `@cue/observability`

**Path:** `packages/observability/` · **Purpose:** the observability +
reliability foundation shared by all three services. Framework-agnostic core at
the root, with NestJS glue behind a subpath so non-Nest services
(`ws-gateway`, `ai-orchestrator`) never pull `@nestjs/*` at runtime.

### Key files & exports

| File | Purpose | Key exports |
|---|---|---|
| `src/tracing.ts` | OpenTelemetry SDK bootstrap (OTLP HTTP + auto-instrumentation) | `initTracing(serviceName, opts)`, `InitTracingOptions`, `TracingHandle` |
| `src/logger.ts` | pino factory, trace-bound, PII-redacted | `createLogger(serviceName, opts)`, `CueLogger`, `CreateLoggerOptions` |
| `src/metrics.ts` | Prometheus registry + canonical SLI catalog | `MetricsRegistry`, `createMetrics(...)`, `CueSlis`, `PROM_CONTENT_TYPE`, `LATENCY_MS_BUCKETS`, `DURATION_S_BUCKETS` |
| `src/sentry.ts` | Sentry init + scrub | `initSentry`, `sentryBeforeSend`, `captureError`, `closeSentry`, `InitSentryOptions` |
| `src/health.ts` | Liveness/readiness registry | `HealthRegistry`, `HealthStatus`, `HealthCheck`, `HealthCheckResult`, `HealthReport` |
| `src/http-metrics-server.ts` | Standalone `/metrics /readyz /livez` HTTP server (for non-Nest services) | `startObservabilityServer(opts)`, `ObservabilityServer`, `ObservabilityServerOptions` |
| `src/redaction.ts` | PII redaction contract | `REDACTION_CENSOR`, `PII_DENYLIST`, `buildRedactPaths`, `isDenylistedKey`, `scrubDeep` |
| `src/reliability/backoff.ts` | Retry with jittered backoff | `retry<T>`, `computeBackoffDelay`, `BackoffOptions`, `RetryInfo` |
| `src/reliability/circuit-breaker.ts` | Provider circuit breaker | `CircuitBreaker`, `CircuitState`, `CircuitBreakerOptions`, `CircuitTransition`, `CircuitOpenError`, `CircuitTimeoutError` |
| `src/nest/*` | NestJS integration | `ObservabilityModule` (+ `ObservabilityModuleOptions`), `ObservabilityController` (`/metrics /readyz /livez`), `MetricsInterceptor`, `LoggingInterceptor`, DI tokens (`OBSERVABILITY_OPTIONS`, `METRICS_REGISTRY`, `HEALTH_REGISTRY`, `CUE_LOGGER`) |

**Canonical SLIs** (`CueSlis`, docs/70): `cueServerLatencyMs` (⭐ the
error-budgeted SLO, p95 < 900ms), `cueLatencyMs`, `sttPartialLagMs`,
`llmTtftMs`, `llmTokensPerSec`, `wsActiveConnections`, `wsConnectionDurationS`,
`apiRequestDurationMs`, `api5xxTotal`, `minutesConsumedTotal` (billing truth,
labelled by `tier` only — no user hash), `sttStreamErrorsTotal`,
`llmStreamErrorsTotal`, `entitlementCheckMs`.

### Subpath exports

```jsonc
"."             → tracing/logger/metrics/sentry/health/http-metrics-server/redaction/reliability
"./nest"        → ObservabilityModule + interceptors + controller + tokens
"./reliability" → backoff + circuit-breaker only
```

- **Dependencies:** `@opentelemetry/*`, `@sentry/node` `^8`, `pino` `^9`,
  `prom-client` `^15`. **Optional peers:** `@nestjs/common`/`@nestjs/core`/
  `reflect-metadata`/`rxjs` (marked optional in `peerDependenciesMeta`), so the
  `/nest` subpath is opt-in.
- **Consumed by:** `services/api` (via `/nest`), `services/ws-gateway` +
  `services/ai-orchestrator` (root + `http-metrics-server`), and `@cue/core`'s
  reliability wrappers (via `./reliability`).
- **Real vs stub:** fully real. Reliability primitives here are the shared
  breaker/backoff that `@cue/core`'s `ResilientSttClient`/`ResilientCueClient`
  build on.
