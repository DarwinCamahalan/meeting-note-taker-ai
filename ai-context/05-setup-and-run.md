# 05 — Setup & Run (As-Built)

> For future AI: this is the practical "how do I actually run it" file, reconstructed from [`../.env.example`](../.env.example), the root [`../README.md`](../README.md), and the workspace `package.json` scripts. Everything degrades cleanly by phase: with only the Phase 0 keys set, the desktop overlay runs entirely in-process. Each later feature turns on when you set its env vars. Start with [`00-overview.md`](00-overview.md) for what these pieces are.

## Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| **Node** | **22** (see [`../.nvmrc`](../.nvmrc); `engines.node >=22`) | Runtime for everything. |
| **pnpm** | `9.12.3` (pinned via `packageManager`) | Workspace + Turborepo package manager. `corepack enable` picks it up. |
| **Docker** | any recent | Only for local Postgres + pgvector (Phase 1+). |
| **Anthropic + Deepgram keys** | — | Phase 0 minimum (the AI pipeline). |

Install once from the repo root:

```bash
pnpm install
cp .env.example .env   # then fill in keys as each phase requires
```

Turbo drives the workspace: `pnpm build` / `pnpm typecheck` / `pnpm lint` / `pnpm dev` (each runs `turbo run <task>` across workspaces).

## Environment variables by service

All services read the **repo-root `.env`** (copy of [`../.env.example`](../.env.example)). Below, grouped by which surface consumes each var. **Unset behavior matters** — the "if unset" column is how the code degrades.

### Phase 0 — AI pipeline (`@cue/core`, used by desktop + ai-orchestrator)

| Var | Consumer | If unset |
|-----|----------|----------|
| `ANTHROPIC_API_KEY` | Claude `claude-haiku-4-5` streaming cues | pipeline can't produce cues |
| `DEEPGRAM_API_KEY` | Deepgram live STT | pipeline can't transcribe |

### Phase 1 — backend services

| Var | Consumer | If unset |
|-----|----------|----------|
| `DATABASE_URL` | `@cue/db` / drizzle-kit / `api` | default `postgres://cue:cue@localhost:5432/cue` |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | `api` ES256 signing (PKCS#8 / SPKI PEM) | **ephemeral** keypair generated at boot — tokens die on restart (`jwt.service.ts`) |
| `API_PORT` | `api` HTTP | `3001` |
| `WS_PORT` | `ws-gateway` | `3002` |
| `ORCHESTRATOR_GRPC_ADDR` | `ws-gateway` → dials ai-orchestrator | `localhost:50051` |
| `NODE_ENV` | `api` | `development` |
| `WEB_BASE_URL` | `api` CORS + PKCE activate page | `http://localhost:3000` |
| `WS_PUBLIC_URL` | `api` (URL handed to clients in a ws-ticket) | `ws://localhost:3002` |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL` / `DEVICE_CODE_TTL` / `DEVICE_CODE_INTERVAL` / `WS_TICKET_TTL` | `api` (seconds) | sane defaults |

### Phase 1 — web (`@cue/web`, Next.js `:3000`)

| Var | Consumer | If unset |
|-----|----------|----------|
| `RELEASES_URL` | `/api/latest-release` | serves the bundled static fallback manifest (local dev) |
| `NEXT_PUBLIC_SITE_URL` | canonical / OpenGraph URLs | `http://localhost:3000` |
| `NEXT_PUBLIC_API_BASE_URL` | browser → api BFF | `http://localhost:3001` |

### Phase 2 — RAG + billing + auto-update (`@cue/api`, `@cue/core`, desktop)

| Var | Consumer | If unset |
|-----|----------|----------|
| `VOYAGE_API_KEY` | `voyage-3.5` embeddings (document + query) | RAG ingest/retrieval unavailable |
| `STRIPE_SECRET_KEY` | `BillingModule` | billing endpoints inoperative |
| `STRIPE_WEBHOOK_SECRET` | `BillingWebhooksModule` (verified against raw body) | webhook rejects |
| `STRIPE_PRICE_PRO` / `STRIPE_PRICE_TEAM` / `STRIPE_PRICE_OVERAGE` | `stripe.catalog.ts` ($20 / $30-seat / $0.13-min) | tier not purchasable |
| `STRIPE_PORTAL_CONFIG_ID` | Customer Portal config | account default Portal |
| `UPDATE_MANIFEST_PUBLIC_KEY` | desktop updater — **independent** minisign key, distinct from R2/S3 | manifest signature can't be verified |

**Desktop packaging / code-signing (CI/release-only — never on a dev box):** `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `CSC_LINK`, `CSC_KEY_PASSWORD`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`. When Apple vars are unset, the `afterSign` notarize hook **skips** rather than failing — so a dev `package` build never blocks on missing certs.

### Phase 3 — Enterprise SSO/SCIM (`@cue/api` `SsoModule`, WorkOS)

| Var | Consumer | If unset |
|-----|----------|----------|
| `WORKOS_API_KEY` | WorkOS SSO/SAML + SCIM | SSO unavailable (consumer PKCE path unaffected) |
| `WORKOS_CLIENT_ID` | AuthKit/SAML authorize URLs | — |
| `WORKOS_WEBHOOK_SECRET` | SCIM webhook raw-body verify | webhook rejects |
| `WORKOS_REDIRECT_URI` | `GET /v1/sso/callback` | `http://localhost:3001/v1/sso/callback` |

### Phase 4 — observability, analytics, reliability

| Var | Consumer | If unset |
|-----|----------|----------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | all services (traces) | exports to OTel default `localhost:4318` |
| `OTEL_SDK_DISABLED` | all services | tracing on (set `true` in unit tests) |
| `SENTRY_DSN` | server Sentry | `initSentry()` is a no-op |
| `LOG_LEVEL` | pino | `info` |
| `METRICS_PORT` | ws-gateway + ai-orchestrator `/metrics` listener (api uses `API_PORT`) | `9464` |
| `AWS_REGION` | log/metric tag + regional admission | `us-east-1` |
| `POSTHOG_KEY` / `POSTHOG_HOST` | server PostHog (typed non-PII allowlist, autocapture OFF) | analytics off |
| `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | browser telemetry | web telemetry is a no-op |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | web source-map upload | build still succeeds |
| `REDIS_URL` | `api` rate limiter + admission counters (control-Redis) | rate limiter **DISABLED, fails open** (dev) |
| `RATE_LIMIT_WINDOW` / `RATE_LIMIT_MAX` | `api` per-user limit | `60` s / `120` req → `429 RATE_LIMITED` |
| `WS_MAX_CONNECTIONS` | `ws-gateway` hard cap (over-cap ⇒ `1013`) | `5000`; `0` = off |
| `SHUTDOWN_DRAIN_MS` | ws-gateway SIGTERM drain | `30000` |
| `CLAUDE_RPM_LIMIT` / `STT_CONCURRENCY` | ai-orchestrator **per-region** admission | `0` = gate disabled (dev). Session ceiling = `min(STT_CONCURRENCY, CLAUDE_RPM_LIMIT / 4)` |

### Desktop backend selection (`apps/desktop`)

| Var | Meaning | Default |
|-----|---------|---------|
| `CUE_BACKEND` | `local` (in-process `@cue/core`) or `gateway` (stream through ws-gateway) | `local` |
| `CUE_API_BASE_URL` | api BFF the desktop authenticates + mints ws tickets against | `http://localhost:3001` |
| `CUE_WS_URL` | optional ws-gateway override | uses the URL in the ws-ticket response |
| `CUE_SESSION_KIND` | gateway session kind (`interview_live`/`interview_prep`/`sales`/`support`/`meeting_notes`) | `interview_live` |
| `CUE_DISCLOSED` | whether the session is disclosed to participants | `false` |
| `CUE_LANGUAGE` | ISO-639-1 session language | `en` |

---

## Running each surface

### Phase 0 — desktop overlay only (no backend)

```bash
# set ANTHROPIC_API_KEY + DEEPGRAM_API_KEY in .env
pnpm --filter @cue/desktop dev        # electron-vite dev server
```

This is the whole product loop: audio → Deepgram → Claude → overlay. Pick the audio source in the overlay's **Me / Them / Both** selector:

- **Me** — your microphone only (default; no extra permission).
- **Them** — system-audio **loopback**, i.e. the other participants (ScreenCaptureKit on macOS 13+, WASAPI on Windows, via Electron — no native addon).
- **Both** — mic + system mixed into one stream (the full conversation).

Choosing **Them** or **Both** shows a one-time **consent disclosure** before capture starts. On **macOS**, system audio also requires **Screen Recording** permission — grant it under *System Settings → Privacy & Security → Screen Recording* and relaunch (the overlay surfaces a clear message if the loopback track is empty). Implementation: [`main/loopback.ts`](../apps/desktop/src/main/loopback.ts) + [`renderer/audio/capture-streams.ts`](../apps/desktop/src/renderer/audio/capture-streams.ts); see [`07-todos-and-gaps.md`](07-todos-and-gaps.md).

### Phase 1+ — the backend spine

First, Postgres 16 with pgvector:

```bash
docker run -d --name cue-postgres \
  -e POSTGRES_USER=cue -e POSTGRES_PASSWORD=cue -e POSTGRES_DB=cue \
  -p 5432:5432 pgvector/pgvector:pg16
```

A dev ES256 keypair (production uses KMS — `TODO(prod)`):

```bash
openssl ecparam -name prime256v1 -genkey -noout -out /tmp/cue-es256.key
openssl pkcs8 -topk8 -nocrypt -in /tmp/cue-es256.key -out /tmp/cue-es256.pkcs8.pem
openssl ec -in /tmp/cue-es256.key -pubout -out /tmp/cue-es256.pub.pem
# paste the PEMs into JWT_PRIVATE_KEY / JWT_PUBLIC_KEY (single line with \n escapes, or base64)
```

### Database migrations (`@cue/db`)

Drizzle-kit, driven from the `@cue/db` workspace. Migrations `0000_init` (extensions + core tables), `0001_enterprise` (SSO/invitations), `0002_team_kb` (document visibility) live in [`../packages/db/migrations/`](../packages/db/migrations/).

```bash
pnpm --filter @cue/db db:migrate      # apply all pending migrations
# other scripts:
pnpm --filter @cue/db db:generate     # generate a new migration from schema changes
pnpm --filter @cue/db db:push         # push schema directly (dev)
pnpm --filter @cue/db db:studio       # Drizzle Studio
```

`0000_init` runs `create extension if not exists vector` (and `pgcrypto`) itself, so the `pgvector/pgvector:pg16` image above needs no extra setup. Note: `0000` uses a SQL `uuidv7()` shim — prefer the `pg_uuidv7` extension for real environments (see [`07-todos-and-gaps.md`](07-todos-and-gaps.md)).

### Start the services

Each in its own terminal (all read the root `.env`):

```bash
pnpm --filter @cue/api dev             # BFF            http://localhost:3001
pnpm --filter @cue/ai-orchestrator dev # gRPC           localhost:50051
pnpm --filter @cue/ws-gateway dev      # ws edge        ws://localhost:3002
pnpm --filter @cue/web dev             # site           http://localhost:3000
```

Health checks: `curl http://localhost:3001/healthz` (api); `/livez` `/readyz` `/metrics` are the Phase-4 probe surface (api on `:3001`; ws-gateway + ai-orchestrator on `METRICS_PORT` `:9464`).

### Container images (Phase 4)

Multi-stage Dockerfiles, **built from the repo root**:

```bash
docker build -f services/api/Dockerfile             -t cue-api .
docker build -f services/ws-gateway/Dockerfile      -t cue-ws-gateway .
docker build -f services/ai-orchestrator/Dockerfile -t cue-ai-orchestrator .
```

---

## The `CUE_BACKEND` toggle {#the-cue_backend-toggle}

This is the single most important runtime switch. The desktop app has **two pipelines**, chosen by `CUE_BACKEND`:

```mermaid
flowchart LR
    subgraph local["CUE_BACKEND=local (default)"]
        D1[desktop renderer<br/>mic capture] --> C1["@cue/core in-process<br/>Deepgram → Claude"] --> O1[overlay cues]
    end
    subgraph gateway["CUE_BACKEND=gateway (opt-in)"]
        D2[desktop] -->|PKCE sign-in + ws ticket| API[api :3001]
        D2 -->|audio over ws| WS[ws-gateway :3002]
        WS -->|gRPC bidi| AIO[ai-orchestrator :50051]
        AIO -->|Deepgram → Claude + RAG| WS -->|cues| D2
    end
```

- **`local`** (default) — the Phase 0 path. `@cue/core` runs **in-process** inside Electron; talks to Deepgram + Claude directly. **No backend services required.** This is what you get if you never touch `CUE_BACKEND`.
- **`gateway`** — the app signs in over **device-code PKCE** (opens the browser to `/activate?code=…`; the MVP **auto-approves a dev user** — `TODO(real IdP)`), mints a short-lived **ws ticket** from `@cue/api`, then streams audio to `@cue/ws-gateway`, which relays over **gRPC bidi** to `@cue/ai-orchestrator` (which adds RAG context). Requires the backend spine running.

```bash
CUE_BACKEND=gateway pnpm --filter @cue/desktop dev
```

The two paths are behavior-equivalent for the user; gateway mode is what enables server-side RAG, entitlements, usage metering, and observability. See the hop-by-hop detail in [`01-architecture-as-built.md`](01-architecture-as-built.md).

## Build the desktop app into an installer

Two steps: `electron-vite build` compiles `main`/`preload`/`renderer` into `apps/desktop/out/`; `electron-builder` then packages that into a distributable under `apps/desktop/release/` (gitignored).

```bash
# Compile only (fast sanity check — no packaging):
pnpm --filter @cue/desktop build

# Local UNSIGNED installer for this Mac's arch (dev/QA). Gatekeeper will
# quarantine it on OTHER machines — right-click → Open to bypass:
cd apps/desktop
CSC_IDENTITY_AUTO_DISCOVERY=false RELEASES_URL="https://releases.local/desktop" \
  pnpm exec electron-builder --mac dmg --arm64 --publish never
```

Gotchas (verified — see [`03-build-journal.md`](03-build-journal.md)):

- `electron` must live in **`devDependencies`** — electron-builder errors if it's a production `dependency`.
- `--publish never` **still expands** the `publish:` block, so `RELEASES_URL` must be set to *something* (any placeholder for a local build).
- The `afterSign` notarize hook **skips cleanly** when `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` are unset — unsigned local builds never block on certs.
- The icon comes from `apps/desktop/build/make-icon.py` → `build/icon.png`; regenerate with `python3 build/make-icon.py`.

The **signed, notarized, universal** (both-arch) release is CI-only via `release-desktop.yml` using the signing env vars listed above. `package:mac` / `package:win` scripts wrap the same flow.

## Stripe & WorkOS local wiring (optional)

- **Stripe webhooks:** `stripe listen --forward-to localhost:3001/v1/billing/webhook` prints the `whsec_…` → set `STRIPE_WEBHOOK_SECRET`. Seed Pro/Team/overage prices in the Stripe dashboard/CLI → set the `STRIPE_PRICE_*` ids. (Full steps in [`../README.md`](../README.md) Phase 2.)
- **WorkOS SSO:** set the four `WORKOS_*` vars; `WORKOS_REDIRECT_URI` must match a registered redirect. Until a real WorkOS org is configured, connections read `not yet connected` (see [`07-todos-and-gaps.md`](07-todos-and-gaps.md)).

## See also

- [`06-conventions.md`](06-conventions.md) — code standards + the git/branch workflow.
- [`reference/services.md`](reference/services.md) — per-service ports, modules, endpoints.
- [`07-todos-and-gaps.md`](07-todos-and-gaps.md) — what's stubbed behind these env toggles.
- [`../infra/README.md`](../infra/README.md) — Terraform apply order + skeleton caveats.
</content>
