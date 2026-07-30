# 62 — Free-Tier Hosting Runbook ($0 backend)

> **Goal:** run AssistMe's backend spine — `api`, `ws-gateway`, `ai-orchestrator`, Postgres+pgvector, Redis — for **$0**, either fully local (Docker) or hosted so the deployed Vercel web has a live backend to talk to.
>
> This is the **cheap/demo** path. It is explicitly **not** the production architecture — that's the Terraform in [`../infra/`](../infra/) (see [`60-devops-infrastructure.md`](60-devops-infrastructure.md)). Free tiers sleep, throttle, and lose data; treat them as dev/QA only.
>
> You still pay the **usage-based AI vendors** (Anthropic, Deepgram, Voyage) per token/minute — those are not free, but they're pay-as-you-go with no floor, and a demo costs cents. Everything *else* here is $0.

---

## Option A — Local full stack (Docker Compose)

The fastest $0 path. Everything runs on your machine; the desktop app connects in `CUE_BACKEND=gateway` mode.

### 1. Configure env

```bash
cp .env.example .env
```

Fill the minimum:

| Var | Needed for | Get it free? |
|-----|-----------|--------------|
| `ANTHROPIC_API_KEY` | cue generation (Claude) | pay-as-you-go, no floor |
| `DEEPGRAM_API_KEY` | live STT | free trial credit, then PAYG |
| `VOYAGE_API_KEY` | RAG embeddings (optional) | free tier available |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | gateway ws-ticket auth | generate locally (below) |

Generate the ES256 keypair (api signs ws-tickets; ws-gateway verifies them — they **must** share the key, so set it explicitly rather than relying on api's ephemeral boot key):

```bash
openssl ecparam -name prime256v1 -genkey -noout -out /tmp/es256.key
openssl pkcs8 -topk8 -nocrypt -in /tmp/es256.key -out /tmp/es256.pkcs8.pem
openssl ec -in /tmp/es256.key -pubout -out /tmp/es256.pub.pem
# Paste the PEM contents into JWT_PRIVATE_KEY / JWT_PUBLIC_KEY in .env
# (single line with \n escapes, or base64-encode each).
```

### 2. Bring it up

```bash
docker compose up --build
```

Compose starts, with health-gated ordering:

| Service | Host port | Notes |
|---------|-----------|-------|
| postgres (pgvector:pg16) | 5432 | migrations in `packages/db/migrations/` auto-apply on **first** init |
| redis | 6379 | api rate-limiter + admission counters (fails open if absent) |
| ai-orchestrator | 50051 (gRPC) | wraps `@cue/core` (Deepgram + Claude + RAG) |
| ws-gateway | 3002 | ws ↔ gRPC bridge; verifies ws-tickets with `JWT_PUBLIC_KEY` |
| api | 3001 | BFF: auth, sessions, billing, `/healthz` `/readyz` `/metrics` |

Reset the database (re-runs migrations):

```bash
docker compose down -v && docker compose up --build
```

> **Verified 2026-07-30 (`docker compose up --build`):** postgres came up healthy with all 15 tables + `vector`/`pgcrypto` extensions (migrations auto-applied), redis healthy, `api` serving `/healthz → {"status":"ok"}`, and `ws-gateway` listening. `ai-orchestrator` **fail-loud-requires** `ANTHROPIC_API_KEY` + `DEEPGRAM_API_KEY` — it only boots once those are in `.env` (blank keys ⇒ it exits with `missing required env var ANTHROPIC_API_KEY`, by design). So a keyless stand-up is 4/5 up; add the two keys for 5/5.

### 3. Point the surfaces at it

- **Web (local):** `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001` in `.env`, then `pnpm --filter @cue/web dev`.
- **Desktop (gateway mode):** `CUE_BACKEND=gateway CUE_API_BASE_URL=http://localhost:3001 pnpm --filter @cue/desktop dev`.

> ⚠️ The **deployed** Vercel site can't reach `localhost`. To connect the live site to a local backend, expose it with a tunnel (`cloudflared tunnel --url http://localhost:3001`) and add that HTTPS origin to `CORS_ORIGINS`. For a persistent hosted backend, use Option B.

---

## Option B — Hosted, still free (Neon + Upstash + Render)

So the **deployed** Vercel web has a live backend. All three providers have a usable free tier.

### B1. Postgres → Neon (free)

- Neon free: 0.5 GB, autosuspends when idle. **pgvector is supported** — enable it once: `CREATE EXTENSION IF NOT EXISTS vector;` (the migrations also do this).
- Copy the pooled connection string → `DATABASE_URL` (append `?sslmode=require`).
- Apply the schema (initdb auto-apply is local-only, so run drizzle against Neon):

```bash
DATABASE_URL='postgres://...neon...?sslmode=require' pnpm --filter @cue/db db:migrate
```

### B2. Redis → Upstash (free)

- Upstash free: serverless Redis, ~10k commands/day. Copy the `rediss://` URL → `REDIS_URL`.
- Optional: the api rate-limiter **fails open** if `REDIS_URL` is unset, so you can skip this for a pure demo.

### B3. Services → Render (free web services, Docker)

Deploy each service as its own Render **Web Service**, "Docker" runtime, pointing at the repo. Set **Dockerfile path** and leave the build context at the repo root:

| Render service | Dockerfile | Port | Key env |
|----------------|-----------|------|---------|
| `assistme-api` | `services/api/Dockerfile` | 3001 | `DATABASE_URL`, `REDIS_URL`, `JWT_*`, `ANTHROPIC_API_KEY`, `CORS_ORIGINS`, `WS_PUBLIC_URL`, `ORCHESTRATOR_GRPC_ADDR` |
| `assistme-ai-orchestrator` | `services/ai-orchestrator/Dockerfile` | 50051 | `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `VOYAGE_API_KEY` |
| `assistme-ws-gateway` | `services/ws-gateway/Dockerfile` | 3002 | `JWT_PUBLIC_KEY`, `ORCHESTRATOR_GRPC_ADDR` (Render-internal address of the orchestrator) |

**Free-tier caveats (important):**

- Render free services **spin down after ~15 min idle** → a cold start (~30–60 s) on the next request. Fine for demos, bad for a live interview. For always-on you'll need a paid dyno or Fly.io.
- gRPC between `ws-gateway` and `ai-orchestrator` on Render uses the private service address; if cross-service gRPC is awkward on free tier, co-locate them or fall back to `CUE_BACKEND=local` (the desktop runs `@cue/core` in-process and skips ws-gateway/orchestrator entirely — see [`../ai-context/05-setup-and-run.md`](../ai-context/05-setup-and-run.md)).

### B4. Wire the deployed web → hosted api

1. On `assistme-api` set `CORS_ORIGINS=https://<your-app>.vercel.app,http://localhost:3000`.
2. In the Vercel project env set `NEXT_PUBLIC_API_BASE_URL=https://assistme-api.onrender.com`, and `WS_PUBLIC_URL` on the api to the public ws-gateway URL (`wss://assistme-ws-gateway.onrender.com`).
3. Redeploy web.

---

## Cost summary

| Piece | Free option | $0? | Ceiling / caveat |
|-------|-------------|-----|------------------|
| Web hosting | Vercel Hobby | ✅ | non-commercial fair use |
| Postgres + pgvector | Neon free | ✅ | 0.5 GB, autosuspend |
| Redis | Upstash free | ✅ | ~10k cmds/day (optional) |
| api / ws-gateway / ai-orchestrator | Render free | ✅ | sleeps after 15 min idle, 512 MB |
| STT | Deepgram | ⚠️ trial then PAYG | ~$0.0043/min (nova-2) |
| Cues | Anthropic Claude | ⚠️ PAYG | `claude-haiku-4-5`, cents/session |
| Embeddings | Voyage free tier | ✅→PAYG | `voyage-3.5` |

**Net:** infra $0; you only pay per-minute/token for the AI vendors while actually running a session. The `local`-backend desktop mode (no ws-gateway/orchestrator/DB) is the absolute-cheapest way to try the product end-to-end.

---

## See also

- [`../docker-compose.yml`](../docker-compose.yml) — the local $0 stack this runbook drives.
- [`../ai-context/05-setup-and-run.md`](../ai-context/05-setup-and-run.md) — env vars by service + the `CUE_BACKEND` toggle.
- [`60-devops-infrastructure.md`](60-devops-infrastructure.md) — the **production** (paid, Terraform/ECS) architecture this is the cheap stand-in for.
</content>
