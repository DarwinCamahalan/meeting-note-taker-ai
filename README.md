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
