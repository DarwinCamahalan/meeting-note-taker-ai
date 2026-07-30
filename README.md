# meeting-note-taker-ai
A Meeting note taker powered by AI

## Getting started — Phase 0 spike

Phase 0 proves the thinnest end-to-end thread — **microphone audio → Deepgram
streaming STT → Claude (`claude-haiku-4-5`) streaming cue → content-protected
overlay** — on an Electron app whose overlay window is excluded from screen
capture/share. It is a throwaway-quality technical spike, not a shippable build.

### Prerequisites

- **Node 22** (see `.nvmrc`; `nvm use` picks it up).
- **pnpm** (this repo uses pnpm workspaces + Turborepo).
- An **Anthropic API key** and a **Deepgram API key**.
- No code signing, notarization, or Apple Developer account is needed for the
  spike — you run the app unpackaged via the dev server.

### Setup

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Configure secrets (never commit .env — it is gitignored)
cp .env.example .env
#   then edit .env and set:
#     ANTHROPIC_API_KEY=...
#     DEEPGRAM_API_KEY=...

# 3. Run the overlay (electron-vite dev)
pnpm --filter @cue/desktop dev
```

Grant the microphone permission when macOS/Windows prompts. Press
`Cmd/Ctrl + \` to toggle the overlay; use the in-overlay Start/Stop control to
begin and end a listening session.

### Capture scope (honest)

- **Microphone capture works** — the renderer uses `getUserMedia` + an
  AudioWorklet to produce 16 kHz mono linear16 PCM chunks, sufficient to prove
  the Phase 0 thread.
- **System loopback (the other party's audio) is a stubbed native TODO.** Real
  loopback needs platform native bindings (macOS ScreenCaptureKit / Core Audio
  taps; Windows WASAPI loopback) and is gated behind descoped consent work. See
  `NotImplementedLoopbackCapture` in `@cue/core`.

### Verify content protection

The overlay calls `setContentProtection(true)` (maps to
`NSWindowSharingType=none` on macOS and `WDA_EXCLUDEFROMCAPTURE` on Windows).
Before trusting it, verify the overlay is **absent** from screen-share and
recording surfaces — Zoom / Google Meet / Microsoft Teams screen-share, plus OS
recorders (macOS `screencapture`/ScreenCaptureKit, Windows Game Bar). These map
to acceptance criteria **A-1 / A-2 / A-3** in
[`docs/81-phase-0-spike-plan.md`](docs/81-phase-0-spike-plan.md#7-acceptance-criteria-all-must-pass-for-go).
Note that content protection excludes the window from capture only — it never
hides the process from the OS or EDR.

See [`apps/desktop/README.md`](apps/desktop/README.md) for how the implemented
pieces map to the Phase 0 acceptance criteria and the list of known TODOs.

## Getting started — Phase 1 (MVP)

Phase 1 adds the backend and web surface around the Phase 0 pipeline:

- **`@cue/api`** — NestJS BFF (`:3001`): OAuth2 device-code PKCE + ES256 JWTs,
  `sessions`, `me`, `documents` (stub), `GET /healthz`. Zod schemas are the
  contract source of truth.
- **`@cue/ai-orchestrator`** — lean NestJS + gRPC server (`:50051`) wrapping
  `@cue/core` (Deepgram STT → Claude cues) on the hot path.
- **`@cue/ws-gateway`** — Node `ws` server (`:3002`): first-message JWT-ticket
  auth, binary audio + JSON control, one gRPC bidi stream per connection.
- **`@cue/web`** — Next.js 15 marketing + download + device-`/activate` site
  (`:3000`).
- **`@cue/db`** — Drizzle schema + client + migrations (Postgres + pgvector).

The Phase 0 desktop path is unchanged and stays the **default** — the backend
is opt-in.

### Additional prerequisites

- **Postgres 16 with the `pgvector` extension** (the `document_chunks.embedding`
  column is `vector(1024)`). Quickest local option:

  ```bash
  docker run -d --name cue-postgres \
    -e POSTGRES_USER=cue -e POSTGRES_PASSWORD=cue -e POSTGRES_DB=cue \
    -p 5432:5432 pgvector/pgvector:pg16
  ```

  The `0000_init` migration runs `create extension if not exists vector` (and
  `pgcrypto`) itself, so the base image above is enough.

- A **dev ES256 JWT keypair**. Generate a PKCS#8 private key + SPKI public key,
  e.g.:

  ```bash
  openssl ecparam -name prime256v1 -genkey -noout -out /tmp/cue-es256.key
  openssl pkcs8 -topk8 -nocrypt -in /tmp/cue-es256.key -out /tmp/cue-es256.pkcs8.pem
  openssl ec -in /tmp/cue-es256.key -pubout -out /tmp/cue-es256.pub.pem
  ```

  Paste the PEM contents into `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` in `.env`
  (single line with `\n` escapes, or a base64 blob). This is a dev-only key —
  production signs via KMS (`TODO(prod: KMS)`), see
  [`docs/40-authentication.md`](docs/40-authentication.md).

### Environment

All services read from the repo-root `.env` (copy from `.env.example`). Beyond
the Phase 0 `ANTHROPIC_API_KEY` / `DEEPGRAM_API_KEY`, Phase 1 adds
`DATABASE_URL`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `API_PORT` (3001),
`WS_PORT` (3002), `ORCHESTRATOR_GRPC_ADDR` (`localhost:50051`), and web vars
(`RELEASES_URL`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SITE_URL`). See the
comments in `.env.example` for the full set.

### Run the backend locally

```bash
# 0. Install deps (Node 22 — see .nvmrc) and configure secrets
pnpm install
cp .env.example .env   # then set DATABASE_URL, JWT_PRIVATE_KEY/PUBLIC_KEY, keys

# 1. Apply the DB schema (creates the vector extension + all tables)
pnpm --filter @cue/db db:migrate

# 2. Start the services (each in its own terminal)
pnpm --filter @cue/api dev             # BFF            http://localhost:3001
pnpm --filter @cue/ai-orchestrator dev # gRPC           localhost:50051
pnpm --filter @cue/ws-gateway dev      # ws edge         ws://localhost:3002
pnpm --filter @cue/web dev             # site           http://localhost:3000
```

Health check: `curl http://localhost:3001/healthz`.

### Point the desktop app at the gateway

The desktop app defaults to the in-process Phase 0 pipeline. To stream through
the backend instead, set `CUE_BACKEND=gateway` (plus `CUE_API_BASE_URL`) in
`.env` before launching:

```bash
CUE_BACKEND=gateway pnpm --filter @cue/desktop dev
```

In gateway mode the app signs in over device-code PKCE (it opens the system
browser to the web `/activate?code=...` page — the MVP auto-approves a dev user,
`TODO(real IdP)`), mints a short-lived ws ticket from `@cue/api`, then streams
audio to `@cue/ws-gateway`, which relays it to `@cue/ai-orchestrator`. With
`CUE_BACKEND=local` (the default) none of the backend services are required.

See [`services/README.md`](services/README.md) for the service-to-doc/port map
and the Phase 1 TODO list.

## Getting started — Phase 2 (RAG, billing, signed auto-update)

Phase 2 adds retrieval-augmented cues, Stripe billing + entitlements, a
Three.js web hero, and a signed desktop auto-update / packaging path. All of it
is **additive** — the Phase 0 local desktop pipeline and the Phase 1 gateway
path keep working unchanged; RAG, billing, and auto-update are opt-in and
degrade cleanly when their env vars are unset.

### New environment variables

All still live in the repo-root `.env` (copy from `.env.example`). Phase 2 adds:

| Var | Used by | Notes |
| --- | --- | --- |
| `VOYAGE_API_KEY` | `@cue/core` `VoyageEmbeddingsClient`, `@cue/api` documents ingest, `@cue/ai-orchestrator` retrieval | `voyage-3.5`, 1024-d, matches `document_chunks.embedding vector(1024)`. Unset ⇒ RAG disabled (retrieval returns empty). |
| `STRIPE_SECRET_KEY` | `@cue/api` Billing + Webhooks | `sk_test_…` in dev. Server-only. |
| `STRIPE_WEBHOOK_SECRET` | `@cue/api` BillingWebhooks | `whsec_…`; verified against the **raw** request body before any reconciliation. |
| `STRIPE_PRICE_PRO` / `STRIPE_PRICE_TEAM` / `STRIPE_PRICE_OVERAGE` | `@cue/api` Billing | Price ids from your Stripe account (see seeding below). Overage is the metered `$0.13/min` price. |
| `STRIPE_PORTAL_CONFIG_ID` | `@cue/api` Billing | Optional `bpc_…` Customer Portal configuration; falls back to the account default. |
| `UPDATE_MANIFEST_PUBLIC_KEY` | `apps/desktop` updater | Pinned **minisign** public key (base64), **distinct** from the artifact-host creds. The manifest signature is verified against this key *before* sha512 / OS code-signature. |
| `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` | packaging (macOS notarize) | CI/local-cert only. When unset, the `afterSign` hook **skips** notarization instead of failing. |
| `CSC_LINK` / `CSC_KEY_PASSWORD` | packaging (macOS signing) | Developer ID `.p12` (base64 or path). |
| `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` | packaging (Windows signing) | `.pfx` (base64 or path). |

Secrets are **env-only** — none are committed, and the packaging/notarize vars
live in the `desktop-release` CI environment, never on a dev machine.

### RAG: how document upload + retrieval work

1. **Upload** — `POST /v1/documents` (authenticated) accepts inline extracted
   text (`{ title, kind, content }`; presigned object-upload is a later flow).
   `@cue/api` `DocumentsModule` runs: `chunkText` (from `@cue/core`) → embed each
   chunk with `VoyageEmbeddingsClient` (`input_type: document`) → persist a
   `documents` row + `document_chunks` rows (each with its `vector(1024)`
   embedding). `GET /v1/documents` and `GET /v1/documents/:id` are org-scoped
   reads. Via the SDK: `client.documents.upload / list / get`.
2. **Retrieval** — the vector search is a **DB-agnostic port** (`VectorSearchPort`
   in `@cue/core`); the pgvector-backed adapter (Drizzle cosine
   `1 - (embedding <=> $q)`, **org-scoped before** the ANN scan, `topK`/`minScore`)
   is implemented in the services (`services/api` and `services/ai-orchestrator`),
   never in `@cue/core` (core stays free of `@cue/db`). At session time
   `@cue/ai-orchestrator` embeds the query (`input_type: query`), retrieves
   top-k `RagChunkMatch`es for the session's org, and injects them into the
   Claude prompt per [`docs/23-prompt-context-spec.md`](docs/23-prompt-context-spec.md).
   With `VOYAGE_API_KEY` unset, retrieval is a no-op and cues are generated
   exactly as in Phase 1.

### Billing: seeding Stripe products/prices

Billing needs three Price ids in `.env`. Create them once in your Stripe test
account (dashboard or CLI), then paste the ids in:

```bash
# Pro — flat $20/mo (recurring licensed)
stripe products create --name "Cue Pro"
stripe prices create --product <prod_pro> \
  --unit-amount 2000 --currency usd -d "recurring[interval]=month"      # -> STRIPE_PRICE_PRO

# Team — $30/seat/mo (recurring licensed, per-seat quantity)
stripe products create --name "Cue Team"
stripe prices create --product <prod_team> \
  --unit-amount 3000 --currency usd -d "recurring[interval]=month"      # -> STRIPE_PRICE_TEAM

# Overage — metered $0.13/live-minute, attached as a second subscription item
stripe products create --name "Cue Live-Minute Overage"
stripe prices create --product <prod_overage> --currency usd \
  -d "recurring[interval]=month" -d "recurring[usage_type]=metered" \
  -d "recurring[aggregate_usage]=sum" -d "billing_scheme=per_unit" \
  -d "unit_amount_decimal=13"                                           # -> STRIPE_PRICE_OVERAGE
```

Free and Enterprise are **not** self-serve (no Checkout price). The tier ↔ price
mapping lives only in `stripe.catalog.ts`, resolved from env — feature code
never hard-codes ids.

Flow: pricing CTAs on the web hit `client.billing.createCheckout` → Stripe
hosted Checkout → success/cancel redirects. The **Customer Portal** link comes
from `POST /v1/billing/portal`. Stripe events land on `POST /v1/billing/webhook`
(raw-body signature verified → deduped by `event.id` → the reconciler updates
`subscriptions` + `entitlements`). **Entitlements are the source of truth** for
feature gates (`@RequireEntitlement(key)` guard); usage accumulates live-minutes
in `usage_events`, reports metered usage to Stripe, and soft-warns / hard-caps /
bills overage per [`docs/50-subscriptions-entitlements.md`](docs/50-subscriptions-entitlements.md).

Local webhook testing:

```bash
stripe listen --forward-to localhost:3001/v1/billing/webhook   # prints the whsec_… -> STRIPE_WEBHOOK_SECRET
```

### Signed auto-update

The desktop updater (`apps/desktop/src/main/updater.ts`) wraps `electron-updater`
but gates it on an **independent minisign signature** over the release manifest
(`latest*.yml`), verified against the pinned `UPDATE_MANIFEST_PUBLIC_KEY`
**before** `electron-updater` runs its own sha512 + OS code-signature checks
(per [`docs/05-remediation-plan.md`](docs/05-remediation-plan.md)). The signature
math lives in a pure, unit-testable `update-verify.ts` (no Electron imports); a
key-id mismatch, bad signature, or unreachable/absent `.minisig` takes the
tamper-reject path and auto-update stays disabled. The web `/api/latest-release`
route serves the normalized manifest and attaches the sibling `latest.yml.minisig`
(`signature` + `signatureUrl`) from the `RELEASES_URL` feed; in local dev the
bundled static-fallback manifest carries an empty signature.

### Packaging (mac / win)

`apps/desktop/electron-builder.yml` targets macOS (`dmg`, `universal`, hardened
runtime + `build/entitlements.mac.plist` requesting microphone + camera; screen
recording is OS-prompted) and Windows (`nsis`, `verifyUpdateCodeSignature`),
publishing to a `generic` feed at `${env.RELEASES_URL}`.

```bash
pnpm --filter @cue/desktop package       # unsigned local build (both configured targets)
pnpm --filter @cue/desktop package:mac    # macOS dmg   (--publish never)
pnpm --filter @cue/desktop package:win    # Windows nsis (--publish never)
pnpm --filter @cue/desktop publish        # build + publish to the release feed (CI)
```

macOS **notarization** (`build/notarize.cjs`, via `notarytool`) and code-signing
(`CSC_LINK`/`CSC_KEY_PASSWORD`), and Windows signing
(`WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`), are **CI / local-cert steps**: they run
only when the corresponding env vars are present and are otherwise skipped so a
dev build never fails for missing certs. After electron-builder emits
`latest*.yml`, the release pipeline minisign-signs it **out of band** with a key
that lives only in CI — never alongside the R2/S3 artifact-host credentials.

### Web hero (Three.js)

`apps/web` renders a `@react-three/fiber` + `@react-three/drei` hero loaded via
`next/dynamic({ ssr: false })` with a static poster fallback, honoring
`prefers-reduced-motion` and code-split so it never bloats first paint. Pricing
CTAs wire to Stripe Checkout through `@cue/sdk`. No new env vars are required for
the web surface beyond the Phase 1 set.

## Getting started — Phase 3 (Team / Enterprise)

Phase 3 layers enterprise SSO/SCIM, org RBAC + an admin console, a shared team
knowledge base, and per-seat Team billing on top of Phases 0–2. It is entirely
**additive** — the consumer OAuth2 device-code PKCE path, personal documents,
and the existing Stripe billing keep working unchanged. Enterprise SSO/SAML and
SCIM directory sync are backed by **WorkOS** (`@workos-inc/node`); when the
WorkOS env vars are unset, the SSO/SCIM surface simply fails loud on use and the
PKCE path is unaffected.

### New environment variables (WorkOS)

All live in the repo-root `.env` (copy from `.env.example`). Phase 3 adds four
server-only WorkOS secrets:

| Var | Used by | Notes |
| --- | --- | --- |
| `WORKOS_API_KEY` | `@cue/api` `SsoModule` (WorkOS client) | `sk_test_…` / `sk_live_…`. Server-only. Every SSO/SCIM call throws if unset. |
| `WORKOS_CLIENT_ID` | `@cue/api` `SsoModule` | `client_…`; used to build the AuthKit/SAML authorization URL. |
| `WORKOS_WEBHOOK_SECRET` | `@cue/api` SCIM webhook | Verified against the **raw** request body of `POST /v1/scim/webhook` before any provisioning runs (WorkOS-signed). |
| `WORKOS_REDIRECT_URI` | `@cue/api` SSO authorize/callback | Absolute callback WorkOS redirects to; defaults to `http://localhost:3001/v1/sso/callback`. |

Get the API key + client id from the WorkOS dashboard, register the redirect URI
there, and copy the directory-sync/webhook signing secret into
`WORKOS_WEBHOOK_SECRET`.

### SSO login (how it works)

1. A user enters their work email on the web `/signin` page. The domain is
   extracted (`features/sso-signin`) and the browser hits
   `GET /v1/sso/authorize?domain=…` (or `orgId=…`), which resolves the org's
   WorkOS connection and returns a WorkOS **AuthKit/SAML authorization URL**.
2. The browser follows that URL to the customer's IdP; on success WorkOS
   redirects to `WORKOS_REDIRECT_URI` → `GET /v1/sso/callback?code=…`.
3. The callback exchanges the code for the WorkOS profile, **finds or creates**
   the `users` row and its `orgMembers` membership (default role `member`), and
   issues Cue's own ES256 JWT — the same token the rest of the API consumes.
   From here the session is indistinguishable from a PKCE session.

Admins manage the connection itself from the admin console (or the SDK
`client.sso.createConnection / listConnections / deleteConnection`), which maps
to the org-scoped, role-gated `…/sso/connections` routes.

### SCIM provisioning / deprovisioning

WorkOS Directory Sync posts signed events to `POST /v1/scim/webhook`. The
webhook verifies the `WORKOS_WEBHOOK_SECRET` signature over the raw body, then
provisions/deprovisions membership: `dsync.user.created` / `.updated` upsert the
user + `orgMembers` row, `dsync.user.deleted` and
`dsync.group.user_removed` deactivate/remove membership, and group events keep
role/membership in sync. This is server-only — there is no SDK method for the
webhook.

### RBAC roles

Org membership carries one of three roles (`orgRoleEnum` in `@cue/db`):

- **owner** — full control incl. billing/seats and org deletion.
- **admin** — manage members, invites, SSO connections, team-KB docs, settings.
- **member** — use the product; read the shared team KB; no admin surface.

Admin-sensitive routes are gated by a `@RequireRole('owner','admin')` decorator +
`RequireRoleGuard` (resolved against the route's `:orgId` against the caller's
`orgMembers.role`), stacked **after** the JWT guard. Feature availability
(whether the org may use SSO/admin at all) stays gated by **entitlements** — the
`team` entitlement — so RBAC answers "who" and entitlements answer "whether".

### Admin console (web `/admin`)

`apps/web` adds a role-protected admin console (reusing `@cue/sdk`):

| Route | Purpose |
| --- | --- |
| `/signin` | SSO login entrypoint — "Sign in with SSO" by email domain. |
| `/admin` | Org overview (members, seats, entitlement snapshot). |
| `/admin/members` | Members + role management + invites (create / accept flow). |
| `/admin/sso` | WorkOS SSO connection setup (create / list / delete). |
| `/admin/settings` | Org settings. |
| `/admin/billing` | Team seats + Stripe Customer Portal launcher. |

### Shared team knowledge base

Org documents are a **shared** team KB: any org member can retrieve
`visibility = 'org'` chunks in RAG (retrieval is scoped by `orgId`, not
`userId`), while `visibility = 'personal'` docs stay private to their uploader.
Members read the shared KB; owners/admins manage it (list/remove via
`…/orgs/:orgId/documents`). At session time `@cue/ai-orchestrator` retrieves
against the session's org KB with the same org + visibility filter applied
**before** the ANN scan. Migration `0002_team_kb` adds the `document_visibility`
enum + column (defaulting existing rows to `org`, preserving Phase-2 behavior).

### Team seat billing

Team is a per-seat Stripe subscription: Checkout/subscription `quantity` tracks
active `orgMembers`, and the `subscriptions.seats` column feeds usage limits
(per-seat live-minute allowance). The admin billing panel reads seat usage and
opens the Stripe Customer Portal for seat/plan management. The `team`
entitlement gates the admin/SSO feature set.

### Migrations

Phase 3 adds two additive migrations, both registered in
`packages/db/migrations/meta/_journal.json` and applied by the same command:

```bash
pnpm --filter @cue/db db:migrate   # runs 0001_enterprise + 0002_team_kb
```

`0001_enterprise` adds the `sso_connections` and `invitations` tables (+ their
enums; `invitations.role` reuses `orgRoleEnum`, admin events reuse the existing
`audit_logs` table). `0002_team_kb` adds the shared-KB `visibility` column.

See [`services/README.md`](services/README.md) for the full Phase 3 endpoint map.

## Getting started — Phase 4 (Scale & Ops)

Phase 4 makes Cue operable at scale without changing any Phase 0–3 behaviour.
It adds **observability** (`@cue/observability`), **Terraform IaC** (`infra/`),
**GitHub Actions CI/CD** (`.github/workflows/`), and **reliability/scale**
plumbing (circuit breakers, graceful degradation, Redis rate limiting, WS
connection caps + backpressure, SIGTERM drain, per-region admission control).
Everything is additive and env-gated: with the new vars unset, services behave
exactly as in Phase 3 (tracing/Sentry/PostHog become no-ops, the rate limiter
fails open, admission gates are disabled).

### Observability endpoints

`@cue/observability` (OpenTelemetry traces + pino structured logs + prom-client
metrics + Sentry errors) is wired into all three services. Transcripts and PII
are **never** logged — pino redaction (`PII_DENYLIST`) and a Sentry `beforeSend`
scrubber strip bodies, cookies, query strings, credential headers, and
denylisted keys before anything leaves the process.

| Endpoint | `@cue/api` (`:3001`) | `@cue/ws-gateway` / `@cue/ai-orchestrator` (`METRICS_PORT`, default `:9464`) |
| --- | --- | --- |
| `GET /metrics` | Prometheus text (served by `ObservabilityModule` on `API_PORT`) | Prometheus text (standalone http server) |
| `GET /livez` | liveness probe | liveness probe |
| `GET /readyz` | readiness probe (flips to `down` on SIGTERM drain) | readiness probe (drains on SIGTERM) |
| `GET /healthz` | existing Phase 1 check (unchanged) | — |

The non-Nest services (`ws-gateway`, `ai-orchestrator`) run a tiny standalone
HTTP listener on `METRICS_PORT` for scrape + ALB probes; the Nest `api` serves
all four on its own port. Canonical SLIs on the shared registry: Cue
server-latency p50/95/99 (`cueServerLatencyMs`), STT partial lag, LLM TTFT,
WS active connections, and minutes consumed (labelled by tier only — no
per-user cardinality).

```bash
curl http://localhost:3001/metrics    # api
curl http://localhost:9464/readyz      # ws-gateway / ai-orchestrator
```

### New environment variables

All still live in the repo-root `.env` (copy from `.env.example`). Phase 4 adds:

| Var | Used by | Notes |
| --- | --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | all services | OTLP/HTTP traces collector (base `http://host:4318` or a full `/v1/traces` URL). Unset ⇒ exports to the OTel default. `OTEL_SDK_DISABLED=true` turns tracing off entirely. |
| `SENTRY_DSN` / `SENTRY_RELEASE` | all services (server) | Unset ⇒ `initSentry()` is a silent no-op. |
| `METRICS_PORT` | `ws-gateway`, `ai-orchestrator` | Standalone `/metrics` `/readyz` `/livez` port (default `9464`). `api` serves these on `API_PORT`. |
| `LOG_LEVEL` | all services | pino level (`trace…fatal`), default `info`. |
| `AWS_REGION` | all services | Region tag stamped on logs/metrics; also selects the regional admission budget. |
| `POSTHOG_KEY` / `POSTHOG_HOST` | server analytics (`posthog-node`) | Typed non-PII event allowlist; autocapture off. |
| `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENV` | `apps/web` (`@sentry/nextjs`) | Browser Sentry; unset ⇒ no-op. `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` are optional source-map upload creds. |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | `apps/web` (`posthog-js`) | Browser analytics; autocapture/session-recording off, text masked, IP not stored. |
| `REDIS_URL` | `api`, `ws-gateway` | Control-Redis for rate-limit counters + admission budgets. Unset ⇒ rate limiter **fails open** (dev). |
| `RATE_LIMIT_WINDOW` / `RATE_LIMIT_MAX` | `api` | Per-user (IP fallback) sliding window; over-limit ⇒ `429 RATE_LIMITED`. Defaults `60`s / `120`. |
| `WS_MAX_CONNECTIONS` | `ws-gateway` | Hard per-task concurrent-socket ceiling; over-cap sockets rejected `1013`; autoscaling targets ~60%. `0` = off. |
| `SHUTDOWN_DRAIN_MS` | `ws-gateway` | Max wall-clock to drain in-flight sockets on SIGTERM before force-close (default `30000`). |
| `CLAUDE_RPM_LIMIT` / `STT_CONCURRENCY` | `ai-orchestrator` | **Per-region** admission budget (never a shared global pool). Effective session ceiling = `min(STT_CONCURRENCY, CLAUDE_RPM_LIMIT / 4)`. `0` = gate disabled (dev). |

### Reliability & degradation (how it behaves under stress)

- **Circuit breakers** (`@cue/observability/reliability`) wrap every provider
  call (Deepgram STT, Claude LLM); `closed → open → half-open`. On the **live-cue
  hot path** the breaker is used but `retry()` is **not** (retries would blow the
  two-budget latency SLO — server-controllable `<~900ms` from endpointing, full
  `<1.2s` p95). Internal idempotent calls may `retry()` with full-jitter backoff.
- **Graceful degradation ladder** (`@cue/core/reliability`): when a provider is
  degraded the session sheds work in order rather than hard-failing — see
  `docs/70-scalability.md §5.2`.
- **Rate limiting** — the `api` Redis guard enforces `RATE_LIMIT_*` per user;
  `ws-gateway` enforces `WS_MAX_CONNECTIONS` + egress/ingress backpressure
  watermarks (`{t:'backpressure', level:'shed'|'ok'}`).
- **Regional admission control** — `ai-orchestrator` meters new sessions against
  `CLAUDE_RPM_LIMIT` / `STT_CONCURRENCY` for **its** region only.
- **Graceful shutdown** — all services drain on `SIGTERM` (readiness flips to
  `down` so the ALB stops routing, in-flight work finishes within the drain
  bound) before exit.

### Infrastructure (Terraform — `infra/`)

AWS ECS Fargate + ALB, Aurora Serverless v2 (Postgres 16 + pgvector),
ElastiCache Redis, CloudFront + Route53 + ACM, Secrets Manager, and S3/R2, as a
single root stack selected per environment (`dev`/`staging`/`prod`) with
`-var-file`, symmetrically instantiated per region (`us-east-1` primary,
`eu-west-1` secondary, toggled by `enable_secondary_region`). **No secrets,
account ids, or state backends are hardcoded** — the S3+DynamoDB backend is
supplied at `init` via `-backend-config`, the Redis AUTH token via
`TF_VAR_redis_auth_token`, and Secrets Manager values are written out-of-band.

```bash
cd infra
terraform init \
  -backend-config="bucket=cue-tfstate-prod" \
  -backend-config="key=prod/us-east-1/terraform.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="dynamodb_table=cue-tflock" -backend-config="encrypt=true"
export TF_VAR_redis_auth_token="$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-40)"
terraform plan  -var-file=envs/prod.tfvars -out=plan.bin
terraform apply plan.bin
# after first apply, populate Secrets Manager values by ARN, per region
```

See [`infra/README.md`](infra/README.md) for the one-time state-backend
bootstrap, the full apply order, the two-region residency model, per-module
detail, and the known skeleton caveats to wire before a first prod apply.

### CI/CD (`.github/workflows/`)

All three workflows authenticate to AWS via **OIDC** (no static creds).

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` | PR | `pnpm install --frozen-lockfile`; Turbo `typecheck`/`lint`/`test`/`build`; supply-chain **gates**: `pnpm audit` (fail on high/critical), gitleaks secret scan, CycloneDX SBOM + a build-provenance attestation. |
| `deploy.yml` | merge / dispatch | Build + push one image per service to ECR (digest promotion by git SHA), ECS deploy per env (blue-green via the deployment circuit breaker + rollback), `production` Environment approval gate for prod. |
| `release-desktop.yml` | tag | electron-builder macOS notarize + Windows sign, publish artifacts, **independently minisign-sign** the update manifest out-of-band, and gate on the update tamper-rejection tests. |

**Required GitHub secrets / vars** (set in repo/Environment settings, never in
files):

- AWS: `secrets.AWS_DEPLOY_ROLE_ARN` (OIDC role), `vars.AWS_REGION`,
  `vars.ECR_REGISTRY`.
- Turbo remote cache (optional): `secrets.TURBO_TOKEN`, `vars.TURBO_TEAM`.
- Secret scan: `secrets.GITLEAKS_LICENSE` (org license, optional).
- macOS signing/notarize: `secrets.APPLE_DEVELOPER_ID_P12`,
  `secrets.APPLE_CERT_PASSWORD`, `secrets.APPLE_ID`,
  `secrets.APPLE_APP_SPECIFIC_PASSWORD`, `secrets.APPLE_TEAM_ID`.
- Windows signing: `secrets.WIN_CSC_LINK`, `secrets.WIN_CSC_KEY_PASSWORD`.
- Update-manifest signing: `secrets.MINISIGN_SECRET_KEY`,
  `secrets.MINISIGN_KEY_PASSWORD`, `vars.MINISIGN_PUBLIC_KEY` (must match the
  desktop-pinned `UPDATE_MANIFEST_PUBLIC_KEY`).
- Release artifact store (R2): `secrets.R2_ENDPOINT`, `secrets.R2_BUCKET`,
  `secrets.R2_ACCESS_KEY_ID`, `secrets.R2_SECRET_ACCESS_KEY`.

The minisign signing key lives **only** in CI, never alongside the R2/S3
artifact-host credentials — the manifest signature is the independent trust
anchor the desktop updater verifies before `electron-updater` runs.

See [`services/README.md`](services/README.md) for the per-service `/metrics` +
health surface and the container images.

---

## Deploy the web app to Vercel

The `apps/web` Next.js site (landing, pricing, download, activate, admin console,
`/api/latest-release`) is Vercel-ready. This gives you a public URL to test the
**marketing/download/admin surface**. Note: backend-dependent actions (real
Stripe Checkout, device activation, SSO) need the `api` service + Postgres hosted
separately — the static/marketing pages render without them.

> ⚠️ **Deploy from the `dev` branch.** `main` is intentionally the held plan-docs
> baseline and contains **no application code** — the built app lives on `dev`.
> A deploy from `main` will fail. Set the Vercel Production Branch to `dev`.

### One-click (button)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDarwinCamahalan%2Fmeeting-note-taker-ai&root-directory=apps%2Fweb&project-name=cue-web&repository-name=cue-web)

The button clones the repo's **default branch**. Because the code is on `dev`, the
button is best used **after** you promote `dev` → `main` (or make `dev` the
default branch). For a private repo staying on `dev`, use the manual import below.

### Manual import (recommended for this private repo)

1. **Vercel → Add New → Project → Import Git Repository** → `DarwinCamahalan/meeting-note-taker-ai`.
2. **Framework Preset:** Next.js. **Root Directory:** `apps/web` — and enable
   **"Include source files outside of the Root Directory in the Build Step"**
   (needed for the pnpm workspace + `@cue/*` packages).
3. **Settings → Git → Production Branch:** `dev`.
4. Vercel uses `apps/web/vercel.json` (install `pnpm install --frozen-lockfile`,
   build `pnpm run build`). `next.config.ts` already `transpilePackages` the
   `@cue/*` deps, so no prebuild step is required.
5. **Environment Variables** (all optional for the marketing site — add when you
   wire the hosted backend):
   - `NEXT_PUBLIC_API_URL` — base URL of the hosted `api` service (for Checkout / activation)
   - `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` — product analytics
   - `RELEASES_URL` — release manifest for the download page (`/api/latest-release`)
   - `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` — optional error tracking (build is inert without them)
6. **Deploy** → you get `https://cue-web-<hash>.vercel.app`.

### What works on the deployed URL

| Works standalone | Needs the hosted backend + DB |
|---|---|
| Landing, pricing, download pages, 3D hero | Real Stripe Checkout (needs `api` + Stripe keys) |
| `/api/latest-release` (with `RELEASES_URL`) | Device activation / login (needs `api` auth) |
| Admin console shell / routing | Live org/member/SSO data (needs `api` + Postgres) |

To make the backend-dependent flows work, host `services/api` (+ Postgres with
pgvector, Redis) — see [`infra/`](infra/) (Terraform) and
[`services/README.md`](services/README.md) — and set `NEXT_PUBLIC_API_URL`.
