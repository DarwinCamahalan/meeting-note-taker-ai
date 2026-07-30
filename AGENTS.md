# AGENTS.md — Start Here (Cue)

> For future AI: this is the **first file to read** before doing anything in this repo. It orients you fast, points you at the deeper as-built docs, and states the non-negotiable rules. It documents **what was actually built** (read from source + git), not the aspirational plan.

## What Cue is (in 3 lines)

- **Cue** is a cross-platform (macOS + Windows) real-time **AI meeting/interview copilot**: a private, always-on-top, transparent overlay that is **excluded from screen capture/share** via OS content-protection APIs.
- It captures mic (and, as a stub, system loopback) audio → **Deepgram** streaming STT → **Claude `claude-haiku-4-5`** streaming cues → the overlay, grounded by **RAG** over the user's own documents (Voyage `voyage-3.5`@1024 + pgvector).
- Built as a **pnpm + Turborepo monorepo** (TypeScript strict, Node 22, scope `@cue/*`) across **5 phases (0–4)**, all merged to the **`dev`** branch.

## Two doc sets — don't confuse them

| Set | Location | What it is |
|-----|----------|------------|
| **The PLAN** (intended design) | [`docs/`](docs/) | The canonical planning set (product, architecture, roadmap, audits). **Draft design intent, not shipped code.** |
| **The AS-BUILT** (this set) | [`ai-context/`](ai-context/) | What was **actually built**, read from real source + git history, with an honest "real vs stubbed" pass. **Start here for reality.** |

When the code and the plan disagree, **the code wins** and [`ai-context/04-plan-mapping.md`](ai-context/04-plan-mapping.md) records the delta.

## Where to start reading (as-built)

1. [`ai-context/README.md`](ai-context/README.md) — index + suggested reading order.
2. [`ai-context/00-overview.md`](ai-context/00-overview.md) — what Cue is, current state, product surfaces.
3. [`ai-context/01-architecture-as-built.md`](ai-context/01-architecture-as-built.md) — the real runtime shape and data flow.
4. [`ai-context/02-monorepo-map.md`](ai-context/02-monorepo-map.md) — the 12 workspaces and how they depend on each other.
5. [`ai-context/07-todos-and-gaps.md`](ai-context/07-todos-and-gaps.md) — what is stub/TODO before you trust anything.

## Golden rules (read before you commit anything)

These come from [`RULES.md`](RULES.md) and the repo's CLAUDE.md. They override convenience.

1. **Branch model: `main` + `dev`.** `main` is the stable baseline; `dev` is the integration branch. Cut feature/docs branches from `dev`; PRs target `dev`; `dev` is promoted to `main` for releases.
2. **`main` is intentionally HELD.** At time of writing `main` sits at **PR #5 (v0.4.0 plan baseline)** — the plan docs only. All of **Phases 0–4 live on `dev`** (26 commits ahead), held back from `main` pending a local build/verification. Do not "fix" this by promoting dev unless explicitly asked.
3. **Auto git flow, but gated actions still ask.** When a task is complete the flow (branch → commit → push → PR → merge) may run without per-action prompts, reporting short status lines. **Force-push, history rewrites, remote-branch deletion, and destructive resets still require explicit approval.** Per the repo owner's CLAUDE.md, treat `commit`/`push`/`merge origin`/`gh pr create` as **forbidden until explicitly asked** — "make the change" is not permission to commit.
4. **Code standards.** React code-splitting on every module (`types.ts`, `utils.ts`, `hooks/use-*.ts`, focused components; pages orchestrate). **No file over 700 LOC.** Strong TypeScript types; avoid `any`.
5. **Legal/consent is DESCOPED.** The dedicated legal docs were intentionally removed (see PR #2 / commit `cc85267`). The **residual risk is real and unresolved** — capturing the other party's audio carries recording-consent + GDPR exposure. Do **not** re-introduce legal docs; document it as descoped. See [`ai-context/07-todos-and-gaps.md`](ai-context/07-todos-and-gaps.md).
6. **No secrets, ever.** All secrets are env-only (repo-root `.env`, gitignored). Never log transcripts or PII in telemetry.

Full conventions: [`ai-context/06-conventions.md`](ai-context/06-conventions.md).

## Map of maps (one screen)

```
cue/  (pnpm + Turborepo · TypeScript strict · Node 22 · scope @cue/*)
├── AGENTS.md              ← you are here (entry point)
├── ai-context/            ← AS-BUILT docs (start: README.md)
├── docs/                  ← the PLAN (design intent, Draft)
├── RULES.md               ← working conventions (git flow, standards)
├── README.md              ← per-phase local run instructions
│
├── packages/   (7 libs)   config · types · core · db · proto · sdk · observability
├── services/   (3 svcs)   api (NestJS BFF :3001) · ai-orchestrator (gRPC :50051) · ws-gateway (ws :3002)
├── apps/       (2 apps)   desktop (Electron overlay) · web (Next.js 15)
├── infra/                 Terraform (AWS ECS Fargate; us-east-1 + eu-west-1)
└── .github/workflows/     ci.yml · deploy.yml · release-desktop.yml
```

| Layer | Where | Deep dive |
|-------|-------|-----------|
| Shared libraries | `packages/*` | [`ai-context/reference/packages.md`](ai-context/reference/packages.md) |
| Backend services | `services/*` | [`ai-context/reference/services.md`](ai-context/reference/services.md) |
| Client apps | `apps/*` | [`ai-context/reference/apps.md`](ai-context/reference/apps.md) |
| Build history (Phases 0–4) | git log / PRs #6–#10 | [`ai-context/03-build-journal.md`](ai-context/03-build-journal.md) |
| Local setup & run | `README.md` | [`ai-context/05-setup-and-run.md`](ai-context/05-setup-and-run.md) |
| Terms | — | [`ai-context/08-glossary.md`](ai-context/08-glossary.md) |

## The 12 workspaces at a glance

| Kind | Name | One line |
|------|------|----------|
| pkg | `@cue/config` | Shared tsconfig base + eslint/prettier config. |
| pkg | `@cue/types` | Shared DTOs / IPC / api / billing / documents / sso / admin types. |
| pkg | `@cue/core` | Deepgram STT + Claude streaming + `CueOrchestrator` + RAG (Voyage, chunker, retriever, context-provider) + reliability + loopback **stub**. |
| pkg | `@cue/db` | Drizzle schema (15 tables) + pgvector + migrations `0000`/`0001`/`0002`. |
| pkg | `@cue/proto` | `cue.orchestrator.v1` gRPC contract. |
| pkg | `@cue/sdk` | `CueApiClient` (typed API client). |
| pkg | `@cue/observability` | OTel / pino / Prometheus / Sentry + circuit-breaker/backoff + Nest module. |
| svc | `@cue/api` | NestJS BFF: auth (PKCE + ES256 JWT), sessions, documents (RAG), billing, entitlements, usage, sso, scim, rbac, admin, orgs, audit, health. |
| svc | `@cue/ai-orchestrator` | gRPC server wrapping `@cue/core` + RAG context on the hot path. |
| svc | `@cue/ws-gateway` | ws ↔ gRPC edge; first-message JWT-ticket auth. |
| app | `@cue/desktop` | Electron: content-protection overlay, typed contextBridge IPC, mic capture, React 19 overlay UI, PKCE auth, opt-in ws-gateway client, signed auto-update, packaging. |
| app | `@cue/web` | Next.js 15: landing/pricing/download/activate + Three.js hero + `/api/latest-release` + admin console. |

> Accuracy note: this file was written against the `dev` branch state. If the tree has moved, re-verify with `git log --oneline` and `ls packages services apps` before trusting the specifics.
