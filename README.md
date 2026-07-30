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
