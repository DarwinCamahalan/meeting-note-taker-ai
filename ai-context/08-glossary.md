# 08 — Glossary

> For future AI: terms of art used across AssistMe's code and docs, defined as they are actually used in this repo (not generically). Where a term maps to a concrete symbol or path, that is named so you can jump straight to it. Cross-references point at the reference files that own the detail.

## Product & client

- **Overlay** — the Electron window that *is* the desktop product: transparent, always-on-top, frameless, rendering live transcript + cues. Toggled with `Cmd/Ctrl+\`. See [`reference/apps.md`](reference/apps.md).
- **Content protection** — OS-level exclusion of a window from screen capture/share. `setContentProtection(true)` maps to macOS `NSWindowSharingType=none` and Windows `WDA_EXCLUDEFROMCAPTURE`. It hides the window **from capture surfaces only** — it does **not** hide the process from the OS process list, task manager, or antivirus (explicitly out of scope, [`../RULES.md`](../RULES.md)).
- **Cue** — (a) the product name, now **AssistMe** (provisional); (b) the unit of output: a short AI-generated suggestion / talking point / note streamed into the overlay in near-real-time.
- **Content-protection UX / capture-invisibility** — the promise that the overlay is absent from Zoom/Meet/Teams/Webex screen-share and OS recorders. Tied to Phase 0 acceptance criteria A-1/A-2/A-3.
- **Loopback / system audio** — the *other* party's audio (system output), as opposed to the user's **microphone**. Loopback capture is a **stub** today (`NotImplementedLoopbackCapture` in `@cue/core`); only mic capture is real. See [`07-todos-and-gaps.md`](07-todos-and-gaps.md).
- **PCM / linear16 / AudioWorklet** — the mic path produces 16 kHz mono linear16 PCM chunks via `getUserMedia` + an AudioWorklet in the renderer.
- **contextBridge IPC** — the typed, allow-listed bridge between the Electron renderer and main process (no `nodeIntegration` in the renderer). See [`reference/apps.md`](reference/apps.md).
- **Disclosed mode** — a (planned, currently **descoped**) mode where the other party is informed recording/assistance is active; part of the consent story. Not built.

## Pipeline & AI

- **STT (speech-to-text)** — streaming transcription via **Deepgram** (AssemblyAI is the plan's fallback). Emits partial + final transcript segments.
- **Endpointing** — STT's detection of an utterance boundary; the trigger point for the "server-controllable" latency budget.
- **Cue orchestrator / `CueOrchestrator`** — the `@cue/core` class that wires STT → prompt assembly (+ RAG) → Claude streaming → cue output. The reusable brain shared by the local desktop path and the `ai-orchestrator` service.
- **`ai-orchestrator`** — the **service** (`@cue/ai-orchestrator`, gRPC `:50051`) that wraps `@cue/core` and injects RAG context on the hot path. Distinct from the `CueOrchestrator` class it hosts.
- **Model routing** — choosing a Claude model by need: `claude-haiku-4-5` (built default, ultra-low latency), `claude-sonnet-5` (balanced), `claude-opus-5` (deep prep). See [`06-conventions.md`](06-conventions.md#ai--llm-defaults).
- **Prompt caching** — Anthropic prompt caching applied to the stable system prompt + user/RAG context to cut latency/cost.
- **TTFT (time to first token)** — an LLM SLI: latency from prompt send to first streamed token.
- **Two-budget latency** — the release-gate model: a *server-controllable* budget (from endpointing, `<~900ms`) plus a *full user-perceived* p95 (`<1.2s`). Retries are deliberately **not** used on the hot path because they'd blow the budget.

## RAG & data

- **RAG (retrieval-augmented generation)** — grounding cues in the user's own documents. Upload → chunk → embed → store; at session time embed the query, retrieve top-k, inject into the prompt.
- **Embeddings / Voyage / `voyage-3.5`@1024** — vector representations from Voyage AI, **1024-dimensional**, matching the `document_chunks.embedding vector(1024)` column. Unset `VOYAGE_API_KEY` ⇒ RAG disabled (retrieval returns empty).
- **`input_type: document` / `query`** — Voyage's asymmetric embedding modes: documents embedded at ingest, the query embedded at retrieval.
- **Chunker / `chunkText`** — `@cue/core` helper that splits document text into embeddable chunks.
- **Retriever / `VectorSearchPort`** — a DB-agnostic port in `@cue/core`; the **pgvector adapter** (Drizzle cosine `1 - (embedding <=> $q)`, org-scoped *before* the ANN scan, `topK`/`minScore`) lives in the **services**, keeping `@cue/core` free of `@cue/db`.
- **`RagChunkMatch`** — the retrieval result DTO: a chunk + its similarity score, injected into the prompt per [`../docs/23-prompt-context-spec.md`](../docs/23-prompt-context-spec.md).
- **pgvector / ANN** — the Postgres extension providing `vector` columns + approximate-nearest-neighbor search over embeddings.
- **Visibility (`personal` / `org`)** — document scope. `org` docs are the **shared team knowledge base** (any member can retrieve them); `personal` docs stay private to the uploader. Added by migration `0002_team_kb`.
- **Drizzle** — the TypeScript ORM used in `@cue/db` for schema (15 tables), the client, and migrations (`0000_init`, `0001_enterprise`, `0002_team_kb`).

## Backend, transport & auth

- **BFF (backend-for-frontend)** — `@cue/api`, the NestJS service (`:3001`) the apps talk REST to; the single front door for auth, sessions, docs, billing, admin.
- **ws-gateway** — `@cue/ws-gateway` (`:3002`), the realtime edge: a Node `ws` server doing first-message JWT-ticket auth and relaying binary audio + JSON control to `ai-orchestrator` over one gRPC bidi stream per connection.
- **gRPC bidi / `cue.orchestrator.v1`** — the `@cue/proto` contract for the bidirectional hot-path stream between `ws-gateway` and `ai-orchestrator`.
- **PKCE / device-code** — the desktop OAuth2 auth flow: authorization-code-with-PKCE via device-code, opening the system browser to web `/activate?code=…`. The MVP auto-approves a dev user (`TODO(real IdP)`).
- **ES256 JWT** — AssistMe's own access token, signed with an EC P-256 key. Dev signs with a local keypair; prod is meant to sign via KMS (`TODO(prod: KMS)`).
- **ws ticket** — a short-lived JWT minted by `@cue/api` that the desktop app presents as the ws-gateway's first message to authenticate the socket.
- **`@cue/sdk` / `CueApiClient`** — the typed client (resources like `documents`, `billing`, `sso`, `admin`) used by web and desktop to call the API.

## Enterprise, identity & billing

- **SSO (single sign-on)** — enterprise login via **WorkOS** (AuthKit/SAML). `GET /v1/sso/authorize` returns the IdP URL; `/v1/sso/callback` exchanges the code, finds/creates the user + membership, and issues AssistMe's own ES256 JWT.
- **SCIM (directory sync)** — automated user provisioning/deprovisioning. WorkOS posts signed events to `POST /v1/scim/webhook` (raw-body signature verified) → upsert/deactivate `orgMembers`.
- **RBAC / roles (`owner` / `admin` / `member`)** — org membership roles (`orgRoleEnum`). Admin routes are gated by `@RequireRole('owner','admin')` + `RequireRoleGuard`, stacked after the JWT guard. RBAC answers **"who"**.
- **Entitlement** — a feature-gate flag that is the **source of truth for "whether"** an org/user may use a feature. Enforced by the `@RequireEntitlement(key)` guard. Reconciled from Stripe subscription state, not hard-coded. (RBAC answers *who*; entitlements answer *whether* — e.g. the `team` entitlement gates the admin/SSO surface.)
- **Stripe Checkout / Customer Portal / webhook** — the billing engine. Checkout creates subscriptions; the Portal manages seats/plans; `POST /v1/billing/webhook` verifies the raw-body signature, dedupes by `event.id`, and reconciles `subscriptions` + `entitlements`.
- **Metered overage / live-minutes** — usage-based billing: minutes beyond plan accrue in `usage_events` and report to Stripe's metered `$0.13/min` price.
- **Seat / per-seat billing** — Team plan tracks Checkout `quantity` against active `orgMembers`; `subscriptions.seats` feeds usage limits.
- **Tier (Free / Pro / Team / Enterprise)** — the subscription plans; Free & Enterprise are not self-serve. Tier ↔ Stripe price mapping lives only in `stripe.catalog.ts`, resolved from env.

## Observability, reliability & infra

- **SLI (service level indicator)** — a measured signal (e.g. `cueServerLatencyMs` p50/95/99, STT partial lag, LLM TTFT, WS active connections, minutes consumed). Labelled by **tier only** — no per-user cardinality.
- **SLO / error budget** — the target on an SLI (e.g. `<1.2s p95`) and the allowance for missing it.
- **`@cue/observability`** — OpenTelemetry traces + pino structured logs + prom-client metrics + Sentry errors + circuit-breaker/backoff, wired into all three services via a Nest module. Enforces the no-transcript/no-PII rule (pino redaction via `PII_DENYLIST` + Sentry `beforeSend` scrubber).
- **Prometheus `/metrics`, `/livez`, `/readyz`** — scrape + probe endpoints. `api` serves them on `API_PORT`; `ws-gateway`/`ai-orchestrator` on `METRICS_PORT` (default `:9464`). `/readyz` flips to `down` on SIGTERM drain.
- **Circuit breaker** — the `closed → open → half-open` wrapper around provider calls (Deepgram, Claude). On the hot path the breaker is used but `retry()` is **not** (retries would blow the latency SLO).
- **Backoff / full-jitter** — retry timing for *idempotent internal* calls only.
- **Graceful degradation ladder** — `@cue/core/reliability`: under provider degradation the session sheds work in order rather than hard-failing.
- **Admission control** — `ai-orchestrator` meters new sessions against a **per-region** budget (`min(STT_CONCURRENCY, CLAUDE_RPM_LIMIT / 4)`), never a shared global pool.
- **Backpressure / connection caps** — `ws-gateway` enforces `WS_MAX_CONNECTIONS` (over-cap sockets rejected `1013`) and egress/ingress watermarks (`{t:'backpressure', level:'shed'|'ok'}`).
- **Graceful shutdown / SIGTERM drain** — on `SIGTERM`, readiness flips `down` (ALB stops routing) and in-flight work finishes within `SHUTDOWN_DRAIN_MS` before exit.
- **minisign / update manifest** — the desktop auto-update trust anchor: the release manifest (`latest*.yml`) is signed with **minisign** and verified against the pinned `UPDATE_MANIFEST_PUBLIC_KEY` *before* `electron-updater` runs its own sha512 + OS code-signature checks. The signing key lives only in CI.
- **Terraform / ECS Fargate / Aurora Serverless v2** — the AWS IaC in `infra/`: ECS Fargate + ALB, Aurora Serverless v2 (Postgres 16 + pgvector), ElastiCache Redis, CloudFront/Route53/ACM, Secrets Manager, S3/R2 — one root stack per env (`dev`/`staging`/`prod`), two regions (`us-east-1` primary, `eu-west-1` secondary).
- **OIDC (CI/CD)** — GitHub Actions authenticate to AWS via OIDC (no static creds). Workflows: `ci.yml`, `deploy.yml`, `release-desktop.yml`.
- **SBOM / provenance / gitleaks** — supply-chain gates in `ci.yml`: CycloneDX SBOM, build-provenance attestation, `pnpm audit` (fail on high/critical), gitleaks secret scan.

## Repo & process

- **`@cue/*`** — the npm scope for all 12 workspace packages.
- **Turborepo / pnpm workspaces** — the monorepo build orchestrator + package manager. Tasks: `build`, `dev`, `typecheck`, `lint` via `turbo run …`.
- **`main` (held) / `dev` (integration)** — the branch model. `main` is deliberately pinned at the v0.4.0 plan baseline; all built phases are on `dev`. See [`06-conventions.md`](06-conventions.md#git--branch-workflow).
- **Additive / env-gated** — the delivery discipline: each phase leaves prior behavior intact and new features no-op when their env vars are unset.
- **Descoped (legal/consent)** — intentionally out of scope for this pass; docs removed, residual risk documented. See [`07-todos-and-gaps.md`](07-todos-and-gaps.md).
- **The PLAN vs the AS-BUILT** — [`../docs/`](../docs/) is intended design (Draft); [`ai-context/`](README.md) is what was actually built. The code wins on conflict.
