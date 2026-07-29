# Reconciliation Decision Record

> Status: Accepted (binding) · Owner: Principal Architect (Platform) · Last updated: 2026-07-29 · Related: [Consolidated audit summary](audits/00-audit-summary.md) · [System architecture](02-system-architecture.md) · [Repository structure](03-repository-structure.md) · [Engineering standards](13-engineering-standards.md) · [Backend services](20-backend-services.md) · [AI pipeline](21-ai-pipeline.md) · [Data model](30-data-model.md) · [Subscriptions & entitlements](50-subscriptions-entitlements.md) · [Payments (Stripe)](51-payments-stripe.md) · [Unit economics](71-unit-economics.md)

This record resolves the **load-bearing cross-doc contradictions** surfaced by the [consolidated audit summary](audits/00-audit-summary.md) — the ones where "two teams would build two systems" because the planning set says different things in different places. Each decision below is **canonical and binding**: it is the single source of truth, and the affected docs must be edited to match it before code lands. This is the concrete execution of the plan's own **"contracts before code"** principle ([System architecture §1.6](02-system-architecture.md)); it maps directly to roadmap remediation item 5 ([audit summary](audits/00-audit-summary.md#prioritized-remediation-roadmap)).

Nine decisions are recorded here, keyed to the audit's finding IDs so the trail is auditable:

- **Architecture / source-of-truth:** A01 (hot-path transport), A02 (billing-webhooks placement), A03 (service path), A04 (ai-orchestrator framework), A05 (tsconfig), A09 (DTO codegen direction).
- **AI pipeline:** SR-09 (embedding model).
- **Finance:** F-01 (overage rate), F-07 (Sonnet pricing base case).

Each entry carries an **Edits (find → replace)** block precise enough to apply consistently without re-litigating the decision. Where an edit changes an *Open questions & risks* item, the corresponding risk is closed (or restated as a residual) so a resolved question is never left reading as "undecided."

---

## A01 — Hot-path transport: gRPC bidirectional streaming; Redis off the per-frame audio path

- **Decision.** The `ws-gateway` ↔ `ai-orchestrator` audio-up / cue-down hop uses **gRPC bidirectional streaming over HTTP/2** — typed, multiplexed, low-latency. **Redis is not on the per-frame audio path.** Redis carries only *control state*: admission / Claude token-bucket, session state, WS resume offsets, and BullMQ job queues. The cue **return hop** (`ai-orchestrator → ws-gateway → desktop overlay`) is budgeted as its own explicit line(s) in the latency table.
- **Context.** The authoritative architecture doc labelled the edge "internal gRPC/WS" while [Backend services](20-backend-services.md) built the same edge on **Redis streams** (`XADD`/`XREADGROUP` per audio frame). At Growth peak that implies ~225k+ Redis ops/sec on a single regional instance that *also* holds the token bucket, sessions and offsets — the SR-01 single-point-of-failure. The two descriptions produce two incompatible systems on the product's defining latency edge.
- **Alternatives considered.** (a) **Redis streams for audio** — durable + replayable, good for reconnect-resume, but adds a store-and-forward hop on every 20ms frame, couples the hot path to one regional Redis, and is the SR-01 SPOF. (b) **Raw TCP / custom framing** — lowest overhead, but re-invents flow control, typing, and multiplexing that gRPC gives for free. (c) **gRPC bidi streaming (chosen)** — HTTP/2 streams give typed contracts, built-in flow control/backpressure, and single-digit-ms same-AZ latency; resume durability is provided by keeping *offsets* (not the audio) in Redis.
- **Trade-offs.** gRPC does not give the free durable replay that a Redis stream would; we accept this because raw audio is never replayed (only cue/transcript *finals* are, and those offsets live in Redis). We gain a clean per-hop latency budget and remove the SR-01 SPOF. Reconnect-resume semantics are preserved via Redis-held last-emitted offsets (control state), not by replaying an audio stream.
- **Consequence.** `ws-gateway` opens a long-lived gRPC bidi stream to `ai-orchestrator` per active session; audio frames flow up, cue/transcript frames flow down, both typed from `packages/types`. Backpressure is gRPC/HTTP/2 flow-control + per-session buffer-depth watermarks (not `XADD` latency). Redis holds `sess:{id}:offsets`, admission/token-bucket, and queues only. Closes [Backend services Open-Q #1](20-backend-services.md#open-questions--risks) and resolves audit **SR-01**.
- **Affected docs.** `02-system-architecture.md`, `20-backend-services.md`, `21-ai-pipeline.md`, `70-scalability.md`.

**Edits (find → replace):**

| Doc · anchor | Current | Replace with |
|---|---|---|
| `02` L110 (C4 mermaid) | `wsg <-->\|internal gRPC/WS\| aio` | `wsg <-->\|gRPC bidi stream (HTTP/2)\| aio` |
| `02` L161 (sequence) | `G->>O: forward frame (internal WS/gRPC)  ~1–5ms` | `G->>O: forward frame (gRPC bidi stream)  ~1–5ms` |
| `02` §4.1 table L187 | `Internal forward \| ws-gateway → ai-orchestrator \| 1–5 ms \| Same VPC/AZ affinity` | `Internal forward (uplink) \| ws-gateway → ai-orchestrator (gRPC bidi) \| 1–5 ms \| Same VPC/AZ affinity; Redis not on this path` |
| `02` §4.1 table L193 | `Cue downlink \| ai-orchestrator → gateway → desktop \| 6–20 ms \| Streamed token-by-token` | Split into two return-hop lines: `Cue return (internal) \| ai-orchestrator → ws-gateway (gRPC bidi) \| 1–5 ms \| Return hop, token-by-token` **and** `Cue return (downlink) \| ws-gateway → desktop (WSS) \| 5–15 ms \| Regional edge, backpressure-aware` |
| `20` §1 catalog L17 | `... internal gRPC + Redis streams \| active AI sessions \| Redis (stream buffers) \| ...` | `... internal gRPC (bidi streaming) \| active AI sessions \| Redis (session offsets / control only) \| ...` |
| `20` §2 mermaid L69 | `ws <-->\|Redis streams\| ai` | `ws <-->\|gRPC bidi stream\| ai` |
| `20` §6 intro L304 | `... relay them to `ai-orchestrator` over a Redis stream, and fan cues/transcripts back ...` | `... relay them to `ai-orchestrator` over a gRPC bidirectional stream, and fan cues/transcripts back ...` |
| `20` §6.1 sequence L315, L327–L333 | `participant R as Redis stream` + `WS->>R: XADD audio:{sessionId} *` / `AI->>R: XREADGROUP (consume)` / `AI->>R: XADD cues:{sessionId} *` / `WS->>R: XADD control:{sessionId} {finalize}` | Replace the Redis participant with `participant AI as ai-orchestrator (gRPC)`; audio + cue frames flow `WS<->AI` over the gRPC bidi stream (`WS->>AI: audio frame` / `AI-->>WS: cue.delta / transcript.partial`). Keep a Redis participant only for `SETNX ws:ticket` and offset writes. |
| `20` §6.4 L386 | `the gateway watches its Redis `XADD` latency and the per-session buffer depth` | `the gateway watches gRPC/HTTP/2 stream flow-control signals and the per-session buffer depth` |
| `20` §6.5 L393 | `the gateway keeps the session's Redis stream and last-emitted offsets for a grace window` | `the gateway keeps the session's last-emitted offsets in Redis (control state) for a grace window` |
| `20` §11 L535 & L539 | `HPA on Redis stream lag` / `readiness also checks Redis stream connectivity` | `HPA on gRPC stream backlog / active sessions` / `readiness also checks the ai-orchestrator gRPC channel` |
| `20` Open-Q #1 L545 | The "gRPC vs Redis-streams … Leaning Redis streams for v1" bullet | Restate as **resolved**: "**Resolved (ADR A01, [decision record](04-decision-record.md#a01)):** the edge is gRPC bidi streaming; Redis holds offsets/control only. Residual: validate gRPC same-AZ p95 under load." |
| `70` §backpressure L272–L273 | `Gateway → orchestrator: Redis stream depth is monitored; a slow orchestrator consumer applies backpressure upstream …` | `Gateway → orchestrator: gRPC/HTTP/2 stream flow control applies backpressure upstream; per-session buffer depth is watermarked, never a Redis stream.` (Leave the `XADD` reference in the *client→gateway* bullet only if it is retitled to gateway buffer depth, not Redis audio.) |

> `21-ai-pipeline.md` §4 already lists the return hop as budget line 8 (`ai-orchestrator → ws-gateway → overlay`); split it into the same two lines as `02` above so the return path is explicitly budgeted per-hop, and confirm the topology text does not imply `ws-gateway` calls STT/Claude directly (that work is in `ai-orchestrator`).

---

## A02 — `billing-webhooks`: canonical logical service, physically a NestJS module inside `services/api` for v1

- **Decision.** `billing-webhooks` is a **canonical logical service name**, but in **v1 it is physically a NestJS module inside `services/api`** (its own controller/route + Stripe raw-body signature verification), **not a separately deployed Fargate service.** It is **extractable to a standalone `services/billing-webhooks` later**, at a stated trigger: **sustained webhook volume or webhook-processing latency that risks the `api` deploy cadence or blast radius** (concretely: p95 webhook processing contending with BFF request latency, or webhook volume warranting independent scaling). This exact statement is used wherever placement is described.
- **Context.** [Repository structure §6](03-repository-structure.md) correctly says "module inside `services/api` in v1," but [Backend services](20-backend-services.md) counts it as one of "five deployable services," draws it as its own Fargate task (`billing-webhooks ×2`), and [Payments §5](51-payments-stripe.md) says "standalone preferred for blast-radius isolation" — three different v1 shapes for the same component.
- **Alternatives considered.** (a) **Standalone service from day 1** — clean blast-radius isolation, but a premature extra deploy/task surface for a low-volume, idempotent webhook sink at pre-PMF scale (audit A06 "stage-inappropriate breadth"). (b) **Module inside `api` for v1, extract at a trigger (chosen)** — minimum surface now, with a documented extraction path so the "extract later" rule is applied consistently.
- **Trade-offs.** Keeping it inside `api` couples webhook availability to BFF deploys; we accept this at v1 volume and mitigate with the extraction trigger and Stripe's multi-day retry window. Blast-radius isolation is deferred, not abandoned.
- **Consequence.** The Stripe webhook route is served by `api` (the `billing` module) on a dedicated path; there is one fewer Fargate service in v1. The logical name is preserved in diagrams and the entitlements bridge so the extraction is a lift-and-shift, not a redesign. Aligns with audit **A02** and the "extract-later" thread of **A06**.
- **Affected docs.** `02-system-architecture.md`, `03-repository-structure.md`, `13-engineering-standards.md`, `20-backend-services.md`, `51-payments-stripe.md`.

**Edits (find → replace):**

| Doc · anchor | Current | Replace with |
|---|---|---|
| `20` §1 L11 | `Five deployable backend services plus the two clients they serve.` | `Four deployable backend services in v1 (`api`, `ws-gateway`, `ai-orchestrator`, `entitlements`) plus the two clients they serve; `billing-webhooks` is a canonical logical service that ships as a NestJS module inside `services/api` in v1 (extractable later — see [decision record A02](04-decision-record.md#a02)).` |
| `20` §1 catalog L19 | `\| `billing-webhooks` \| NestJS 11 \| HTTPS (Stripe webhooks) \| webhook volume \| Postgres \| ...` | Keep the row but change the runtime cell to `NestJS 11 module in `services/api` (v1)` and add "extractable at sustained webhook volume/latency". |
| `20` §1.1 heading L23 + body L25/L28 | "Why five services, not one" / "isolate money-handling (`entitlements`, `billing-webhooks`)" / "Five services adds …" | "Why four v1 services (five logical), not one"; note money-handling is isolated as `entitlements` (service) + `billing-webhooks` (module in `api`, extractable). |
| `20` §2 rule L86 | `Only `api` and `ws-gateway` are internet-facing (plus `billing-webhooks` on a dedicated path).` | `Only `api` and `ws-gateway` are internet-facing; the Stripe webhook path is served by `api` (the `billing-webhooks` module) on a dedicated, signature-verified route.` |
| `20` §11 mermaid L520 & L526 | `stripeEdge["Stripe → dedicated path"] --> bw` and `bw["billing-webhooks ×2 (min)"]` | Route Stripe to `api` (webhook module); remove the standalone `bw` task from the v1 Fargate cluster (or annotate it "future extraction" and not counted in v1). Update the §11 table row accordingly. |
| `51` §5 L118 | `... a small, hardened NestJS module (can run in the `api` container or standalone on ECS Fargate; standalone preferred for blast-radius isolation).` | `... a small, hardened NestJS module that ships **inside `services/api`** in v1; it is extractable to a standalone `services/billing-webhooks` when sustained webhook volume or processing latency warrants blast-radius isolation (see [decision record A02](04-decision-record.md#a02)).` |
| `02` §3.1 table L139 | `billing-webhooks` row | Append to the Owning-doc / responsibility cell: "v1: NestJS module inside `services/api`; canonical logical name, extractable later." |

> `03-repository-structure.md` §6 (L298) and its top-level layout comment (L21) already state this correctly — use that wording as the canonical phrasing to copy into the docs above; align the [Repo Open-Q L307](03-repository-structure.md#open-questions--risks) to name the same extraction trigger. `13-engineering-standards.md` L5 and L285 may keep the logical name in service lists but must not describe it as separately deployed.

---

## A03 — Canonical service path is `services/api` (there is no `apps/api`)

- **Decision.** Backend services live under **`services/`**: `services/api`, `services/ws-gateway`, `services/ai-orchestrator`, `services/entitlements`. **`apps/` is for clients only** (`apps/desktop`, `apps/web`). Every `apps/api/...` path is a bug and must read `services/api/...`.
- **Context.** [Repository structure](03-repository-structure.md) defines the canonical `services/*` layout, but several docs reference `apps/api/src/...` in code comments, forking the mental model of where the BFF lives.
- **Alternatives considered.** None material — this is a consistency fix to the already-canonical `services/*` layout in `03`. (`apps/api` is not proposed anywhere as a deliberate layout.)
- **Trade-offs.** None; purely corrective.
- **Consequence.** All file-path references, import roots, and CI/codeowners globs use `services/api`. Aligns with audit **A03**.
- **Affected docs.** `20-backend-services.md`, `40-authentication.md`, `50-subscriptions-entitlements.md`, `51-payments-stripe.md`.

**Edits (find → replace):**

| Doc · anchor | Current | Replace with |
|---|---|---|
| `20` §3.1 L102 | `apps/api/src/` (module-structure tree root) | `services/api/src/` |
| `40` L267 | `// apps/api/src/auth/roles.guard.ts (orchestrates; logic lives in core)` | `// services/api/src/auth/roles.guard.ts (orchestrates; logic lives in core)` |
| `50` §5.1 L215 | `// api: apps/api/src/entitlements/require-entitlement.guard.ts` | `// api: services/api/src/entitlements/require-entitlement.guard.ts` |
| `51` §5.2 L145 | `// billing-webhooks: apps/api/src/billing/webhooks.controller.ts` | `// billing-webhooks (module in api): services/api/src/billing/webhooks.controller.ts` |

> Apply a repo-wide `grep -rn "apps/api"` as a CI guard after the edits; the correct client roots remain `apps/desktop` and `apps/web`.

---

## A04 — `ai-orchestrator` is a NestJS application (lean/standalone bootstrap on the hot path)

- **Decision.** `ai-orchestrator` **is a NestJS 11 application**, consistent with the other NestJS backend services (`api`, `entitlements`, and the `billing-webhooks` module). It is **bootstrapped in a lean / standalone mode** for the hot path — DI, modules, typed providers, and the exception filter, but **no heavy HTTP middleware stack on the gRPC streaming path**. `ws-gateway` remains the raw transport edge (NestJS with a `uWebSockets`/`ws` adapter for connection density, per ADR-003), so "all backend services are NestJS applications" holds without contradicting the transport tech choice.
- **Context.** [Backend services](20-backend-services.md) calls it "NestJS 11 (worker mode)," [Engineering standards §1.2](13-engineering-standards.md) shows it with a full NestJS module structure, while [Repository structure §5.3](03-repository-structure.md) describes it as a "leaner `src/` with `handlers/`, `pipeline/`, `providers/`" — implying a non-Nest shape. Two teams would scaffold it two ways.
- **Alternatives considered.** (a) **Bare Node service** for minimum overhead on the hot path — but forfeits shared DI, config-zod bootstrap, error taxonomy, and testing patterns used everywhere else, and diverges from the house structure. (b) **NestJS lean/standalone bootstrap (chosen)** — keeps consistency and shared cross-cutting wiring while avoiding the HTTP middleware cost on the streaming path (NestJS `createApplicationContext` / custom transport, mirroring ADR-002's "thin handlers where throughput matters").
- **Trade-offs.** A thin NestJS bootstrap cost on startup; accepted for consistency, testability, and shared error/config plumbing. The hot path stays middleware-free.
- **Consequence.** `ai-orchestrator` scaffolds like the other services (`*.module.ts`, `services/`, `dto/`, typed providers) but boots standalone/lean for the gRPC stream. Aligns with audit **A04** (and keeps ADR-003 intact for `ws-gateway`).
- **Affected docs.** `02-system-architecture.md`, `03-repository-structure.md`, `13-engineering-standards.md`, `20-backend-services.md`.

**Edits (find → replace):**

| Doc · anchor | Current | Replace with |
|---|---|---|
| `20` §1 catalog L17 | `\| `ai-orchestrator` \| NestJS 11 (worker mode) \| ...` | `\| `ai-orchestrator` \| NestJS 11 (lean/standalone bootstrap, no HTTP middleware on the gRPC hot path) \| ...` |
| `03` §5.3 L290 | `ws-gateway` and `ai-orchestrator` are leaner (latency-critical): a `src/` with `handlers/`, `pipeline/` ... | `ai-orchestrator` is a NestJS app bootstrapped lean/standalone for the hot path (modules + typed providers under `pipeline/` — STT → context-assembly → Claude — and `providers/` adapters, no heavy HTTP middleware). `ws-gateway` is the raw transport edge (`uWebSockets`/`ws`). Service internals owned by [Backend services](20-backend-services.md) and [AI pipeline](21-ai-pipeline.md). |
| `02` §3 C4 L78 / §3.1 table L137 | `aio["ai-orchestrator ..."]` (no framework) | Annotate ai-orchestrator as "NestJS (lean bootstrap)" in the container node and/or the responsibility table for parity with `api`. |

> `13-engineering-standards.md` §1.2 (L55–L67) already shows the canonical NestJS shape for `ai-orchestrator` — keep it as the reference; the edits above bring `20` and `03` into line with it.

---

## A05 — Single tsconfig source of truth: `packages/config/tsconfig.base.json`

- **Decision.** The **only** shared TypeScript base config is **`packages/config/tsconfig.base.json`**; every app/package/service `tsconfig.json` extends it. The **root `tsconfig.base.json` is removed/deprecated**; no doc may present a second, divergent base config. Per-project overrides (module/moduleResolution, `rootDir`/`outDir`, `lib` for Node vs DOM) live in the thin per-project `tsconfig.json`, not in a competing base.
- **Context.** [Engineering standards §2](13-engineering-standards.md) puts the base at `packages/config/tsconfig.base.json`; [Repository structure](03-repository-structure.md) shows a **root** `tsconfig.base.json` in the layout, references it in `turbo.json` `globalDependencies`, and prints a **different** compiler-options block in §3.1. Two base configs = silent drift in strictness flags.
- **Alternatives considered.** (a) **Root-level base** — conventional, but `packages/config` already owns eslint/tailwind/env presets, so co-locating the tsconfig base there keeps all shared config in one workspace package and lets services import it via `workspace:*`. (b) **`packages/config/tsconfig.base.json` (chosen).**
- **Trade-offs.** Extending a base that lives in a workspace package (vs repo root) requires the package be resolvable at typecheck time; already true since `@cue/config` is a declared dependency.
- **Consequence.** One canonical strict-flag set (the fuller `13` block is authoritative — `noFallthroughCasesInSwitch`, `noImplicitReturns`, `noPropertyAccessFromIndexSignature`, `useUnknownInCatchVariables`, etc.). Aligns with audit **A05** and the DTO/CI-drift work in A09.
- **Affected docs.** `03-repository-structure.md` (and confirm `13-engineering-standards.md` remains canonical).

**Edits (find → replace):**

| Doc · anchor | Current | Replace with |
|---|---|---|
| `03` §1 layout L37 | `├── tsconfig.base.json           # shared TS compiler options` | Remove this root entry; add under `packages/config/`: `│   └── tsconfig.base.json       # shared TS compiler options (single source of truth)`. Update the §1 `config` package comment (L28) to mention it. |
| `03` §2.2 turbo.json L61 | `"globalDependencies": ["tsconfig.base.json", ".npmrc"]` | `"globalDependencies": ["packages/config/tsconfig.base.json", ".npmrc"]` |
| `03` §3.1 heading L125 + block L127–L147 + prose L148 | `### 3.1 `tsconfig.base.json`` with a root-level JSON block and "Each package/app has a thin `tsconfig.json` that extends this" | Retitle `### 3.1 `packages/config/tsconfig.base.json` (single source of truth)`; replace the divergent block with a pointer to the authoritative block in [Engineering standards §2](13-engineering-standards.md) (or reproduce that exact block), and keep the "thin per-project tsconfig extends it; Node services drop DOM libs" note. |

---

## A09 — DTO codegen direction: `api` Zod schemas are the source of truth → generated types in `packages/types`, drift-checked in CI

- **Decision.** For **API and inter-service DTOs**, the **`api` Zod schemas are the source of truth.** A **codegen step generates the shared static DTO types into `packages/types`** (`z.infer` → emitted `.d.ts`/types), consumed by `packages/sdk`, `ws-gateway`, `entitlements`, and the clients. A **CI drift check** regenerates and fails the build if committed `packages/types` output diverges from the schemas. This governs request/response DTOs, the WS envelope, job payloads, and internal service DTOs. **DB row types are a separate axis:** they are inferred from **Drizzle schema** (`InferSelectModel`/`InferInsertModel`, [Data model §4](30-data-model.md)) and also re-exported through `packages/types`; the two owners (Zod for wire DTOs, Drizzle for DB rows) do not overlap and the boundary is documented so "single source of truth" never collides.
- **Context.** [System architecture §1.6](02-system-architecture.md) and [Engineering standards §1 rule 4](13-engineering-standards.md) say "`packages/types` is the single source of truth for DTOs," while [Backend services §3.2/§8](20-backend-services.md) say DTO types are **derived from** the `api` Zod schemas — leaving the *direction* (and whether `packages/types` is authored or generated) ambiguous, and with no explicit drift gate.
- **Alternatives considered.** (a) **Hand-author types in `packages/types`, validate separately** — double maintenance, guaranteed drift. (b) **tRPC end-to-end inference** — great DX but hard-couples client/server versions (rejected in [Backend services §5](20-backend-services.md) because desktop auto-updates independently). (c) **Zod-as-truth → codegen to `packages/types` + CI drift check (chosen)** — one runtime validator, generated static types, stable versioned wire contract.
- **Trade-offs.** Adds a codegen build step and a CI check; accepted because it makes schema/type drift structurally impossible and preserves the decoupled `/v1` contract.
- **Consequence.** `packages/types` becomes (for wire DTOs) a **generated artifact**, not hand-edited; the generator runs in the Turbo pipeline and its output is verified in CI. Aligns with audit **A09**.
- **Affected docs.** `20-backend-services.md`, `13-engineering-standards.md`, `02-system-architecture.md`, `30-data-model.md`.

**Edits (find → replace):**

| Doc · anchor | Current | Replace with |
|---|---|---|
| `20` §8 L449 | `HTTP DTOs are **derived from** the Zod schemas in `api` ... the inferred type is exported to `packages/types` so validation and types can never drift.` | Keep, and add: "This is a **codegen step** — `api` Zod schemas are the source of truth; `packages/types` wire DTOs are **generated** from them (`z.infer` → emitted types). A **CI drift check** (`turbo run codegen:check`) regenerates and fails the build if committed types diverge from the schemas." |
| `20` §8 L450 | `Breaking a shared type is a breaking change gated by CI (type-check across all packages ...)` | Append: "and by the DTO codegen drift check (§ above)." |
| `13` §1 rule 4 L30 & §2 L211 | "`packages/types` is the single source of truth for cross-boundary DTOs" | Refine to: "`packages/types` holds the cross-boundary DTOs; for **wire/API DTOs they are generated** from the `api` Zod schemas (source of truth) with a CI drift check; for **DB row types** they are generated from the Drizzle schema ([Data model §4](30-data-model.md))." |
| `02` §1.6 L16 | "All inter-service and client DTOs live in `packages/types`; the typed client lives in `packages/sdk`." | Append: "Wire DTOs in `packages/types` are **generated from the `api` Zod schemas** (source of truth) and CI-drift-checked; DB row types are generated from Drizzle. See [decision record A09](04-decision-record.md#a09)." |
| `30` §1 principle 1 L11 / §4 | "Drizzle ORM is the single source of truth for schema. TypeScript DTOs are derived ... re-exported from `packages/types`." | Add a one-line scope note: "Drizzle is the source of truth for **DB row types**; **API/wire DTOs** are generated from the `api` Zod schemas (see [decision record A09](04-decision-record.md#a09)) — the two are distinct and non-overlapping." |

---

## SR-09 — Embedding model: `voyage-3.5` at 1024 dimensions, query and document, end-to-end

- **Decision.** **`voyage-3.5` at 1024 dimensions** is pinned for **both** the document-ingest embeddings **and** the hot-path query embedding — the same model and dimensionality end-to-end. The pgvector embedding column is **`vector`/`halfvec(1024)`**. A **guard test fails CI if the query and document embedding models (or dimensions) ever diverge**, and a second assertion pins the column dimension to the model output. All references to `voyage-3.5-lite` and `voyage-3-large` as the chosen model are removed.
- **Context.** The docs named three different models: [AI pipeline](21-ai-pipeline.md) used `voyage-3.5` for documents but **`voyage-3.5-lite` for the query**, while [Data model](30-data-model.md) named **`voyage-3-large`** for the column. Mixing embedding spaces between query and document silently degrades retrieval — a correctness bug that no type-check catches.
- **Alternatives considered.** (a) **`voyage-3.5-lite` for queries** (cheaper/faster) — but a different model = a different vector space than the stored document vectors, so cosine similarity is not comparable; the latency saving is not worth silent recall loss. (b) **`voyage-3-large`** — higher-quality but a different dimensionality/space again, and unused elsewhere. (c) **`voyage-3.5` @ 1024 for both (chosen)** — single space, single dimension, comparable vectors; query embedding is one short call already budgeted.
- **Trade-offs.** Slightly higher per-query embedding cost/latency than `-lite`; negligible against the retrieval-correctness guarantee and already within the [§4 latency budget](21-ai-pipeline.md#4-latency-budget-p95-mic--first-visible-cue-token).
- **Consequence.** One embedding model config value shared by ingest and query paths; a model change is a deliberate re-embed + reindex migration with a dual-write window. Aligns with audit **SR-09**; closes the "embedding dimension lock-in" and "embedding model divergence" risks by making divergence a CI failure.
- **Affected docs.** `21-ai-pipeline.md`, `30-data-model.md`.

**Edits (find → replace):**

| Doc · anchor | Current | Replace with |
|---|---|---|
| `21` §4 budget L101 (hop 4) | `Query embedding (Voyage `voyage-3.5-lite`)` | `Query embedding (Voyage `voyage-3.5`, 1024-dim — same model as document embeddings)` |
| `21` §7.1 L236 | `Voyage AI `voyage-3.5` (1024-dim) for documents at ingest; `voyage-3.5-lite` for the hot-path query embedding (cheaper, faster ...)` | `Voyage AI `voyage-3.5` (1024-dim) for **both** document-ingest embeddings **and** the hot-path query embedding — the query and document embedding spaces must be identical. A guard test fails CI if they diverge.` |
| `30` §3.4 L353 comment | `// Voyage AI `voyage-3-large` -> 1024 dims. Change the literal here AND reindex if the model changes.` | `// Voyage AI `voyage-3.5` -> 1024 dims (same model for query + document). Change the literal here AND reindex if the model changes.` |
| `30` §5 table L482 | `Embedding model \| Voyage AI `voyage-3-large` \| ... high retrieval quality.` | `Embedding model \| Voyage AI `voyage-3.5` (query + document, 1024-dim) \| Owned by [AI pipeline](21-ai-pipeline.md); one embedding space end-to-end.` |
| `30` §5 L483 (Dimensions) | `... hard-coded in the column + a guard test.` | Keep, and extend: "... + a guard test that also fails if the query and document embedding models diverge." |
| `30` Open-Q L661 | `the `vector(1024)` column is coupled to `voyage-3-large`` | `the `vector(1024)` column is coupled to `voyage-3.5`` |

---

## F-01 — Overage rate: single canonical value **$0.13 per live minute**

- **Decision.** The metered live-minute overage rate is **$0.13 per live minute**, canonical across Stripe config and the unit-economics model. This replaces the **$0.02/min** ("illustrative") Stripe-catalog figure and the **~$0.15/min** modelled figure — a 7.5× contradiction (audit F-01). $0.13/min is set to preserve the intended **~10×-COGS overage-margin defense** (≈ 9× the ~1.5¢/min live COGS) so heavy users past the cap remain profitable; it **must still be validated against willingness-to-pay** before Pro GA.
- **Context.** [Payments §2](51-payments-stripe.md) configured the metered price at $0.02/min (illustrative) while [Unit economics §4.1/§9](71-unit-economics.md) modelled overage at ~$0.15/min "≈10× COGS." The two numbers make the "heavy users become more profitable" thesis either true or false depending on which doc you read.
- **Alternatives considered.** (a) **$0.02/min** — below marginal COGS in some mixes; breaks the margin thesis (this was a placeholder, not a decision). (b) **~$0.15/min** — the modelled ~10× defense, but never reflected in Stripe config and untested against WTP. (c) **$0.13/min (chosen)** — clears the ~10× intent with headroom, a rounder consumer-facing number, single value in both config and model.
- **Trade-offs.** $0.13 is ~9× COGS rather than exactly 10×; accepted as a WTP-friendlier round number that still strongly protects margin. Final validation against willingness-to-pay is a gating step before Pro GA.
- **Consequence.** `STRIPE_PRICE_OVERAGE_MINUTES` is priced at $0.13/min; the unit-economics overage math uses $0.13/min; [Entitlements §6.3](50-subscriptions-entitlements.md) overage enforcement references the canonical rate rather than deferring. Aligns with audit **F-01** and roadmap item 11.
- **Affected docs.** `51-payments-stripe.md`, `71-unit-economics.md`, `50-subscriptions-entitlements.md`.

**Edits (find → replace):**

| Doc · anchor | Current | Replace with |
|---|---|---|
| `51` §2 catalog L29 | `Overage minutes \| `overage_minutes` \| month \| $0.02 / min (illustrative) \| ...` | `Overage minutes \| `overage_minutes` \| month \| **$0.13 / min (canonical)** \| ...` |
| `51` §2 note L35 | `Overage rate ($0.02/min) is **illustrative**; the final number is owned by [Unit Economics] ...` | `Overage rate is **$0.13/min (canonical, [decision record F-01](04-decision-record.md#f-01))** — set to preserve the ~10×-COGS margin defense; still to be validated against willingness-to-pay before Pro GA.` |
| `51` Open-Q L324 | `$0.02/min is a placeholder; the real number is blocked on [Unit Economics] ...` | `Overage is set to **$0.13/min** ([decision record F-01](04-decision-record.md#f-01)); residual: validate against willingness-to-pay and observed marginal COGS before Pro GA.` |
| `71` §4.1 L123 | `overage bills at **~$0.15/min (≈10× COGS)**` | `overage bills at **$0.13/min (≈9× the ~1.5¢/min live COGS)**` |
| `71` §9 lever L239 | `overage @ ~10× COGS makes heavy users profitable` | `overage @ **$0.13/min (≈9× COGS)** makes heavy users profitable` |

> [Entitlements §6.3](50-subscriptions-entitlements.md#63-enforcement-ladder-soft-warn--hard-cap--overage) and its [Open-Q L408](50-subscriptions-entitlements.md#10-open-questions--risks) may keep pointing to unit economics for the rate, but should name the canonical **$0.13/min** rather than "must be finalized."

---

## F-07 — Sonnet 5 pricing: base case is post-intro **$3 / $15 per 1M**; intro $2 / $10 is expiring upside only

- **Decision.** All COGS, margin, and sensitivity math uses **post-intro Sonnet 5 pricing — $3 / $15 per 1M tokens — as the base case.** The introductory **$2 / $10** (through **2026-08-31**) is shown **only as expiring upside**, never as the base assumption. Any premium-call cost, blended margin, and the sensitivity grid are computed at $3 / $15.
- **Context.** [Unit economics](71-unit-economics.md) used the intro $2/$10 as the operative number for the "expand answer" premium cost (§3.4) and the sensitivity grid (§8), even though GA likely lands after the 2026-08-31 cliff (audit F-07). This understates COGS at the moment the business is live.
- **Alternatives considered.** (a) **Intro $2/$10 as base** — optimistic; expires before/around GA, so the model would be wrong on day one. (b) **Post-intro $3/$15 as base, intro as upside (chosen)** — conservative, correct at GA, with the intro window shown as a bonus while it lasts.
- **Trade-offs.** Slightly lower headline margins on Sonnet-heavy cells; this is the honest base case. The intro window remains documented as time-boxed upside.
- **Consequence.** Premium-call estimates rise ~1.5× on Sonnet lines; the sensitivity-grid Sonnet-share columns shift down modestly (the all-Haiku 0% column and the minutes axis are unchanged — model mix is not the dominant axis). The router's "tighten Sonnet eligibility post-cliff" behavior is confirmed as specced. Aligns with audit **F-07**.
- **Affected docs.** `71-unit-economics.md` (and confirm `21-ai-pipeline.md` §5 / `02` ADR-005 already show $3/$15 as base with intro as a footnote — they do; no change needed there beyond consistency).

**Edits (find → replace):**

| Doc · anchor | Current | Replace with |
|---|---|---|
| `71` §3.4 L92 | `"Expand answer" hotkey (Pro+) \| Sonnet 5 (intro $2/$10) \| ~5K in ... + 512 out \| **~$0.02–0.03**` | `"Expand answer" hotkey (Pro+) \| Sonnet 5 (**base $3/$15**) \| ~5K in ... + 512 out \| **~$0.03–0.045** (intro $2/$10 → ~$0.02–0.03 while it lasts)` |
| `71` §3.4 L97 | `Sonnet's post-intro price (after 2026-08-31) roughly 1.5× these — tracked as a margin risk (§9).` | `These use the **post-intro $3/$15 base case**; the intro $2/$10 (through 2026-08-31) is expiring upside (~0.67× these) — see [decision record F-07](04-decision-record.md#f-07).` |
| `71` §8 grid L215 | `... share of cues escalated off Haiku onto Sonnet 5 (intro $2/$10). Includes STT + infra; ...` | `... share of cues escalated off Haiku onto Sonnet 5 (**base case $3/$15**). Includes STT + infra; ...` **and recompute the non-zero Sonnet-share columns at $3/$15** (the 0%/all-Haiku column and the minutes axis are unchanged; Sonnet-share cells drop by roughly 1–4 points, more at high usage). Add a footnote: "At intro $2/$10 (through 2026-08-31) these Sonnet-share cells are a few points higher — expiring upside." |
| `71` §2.1 L27 | `$3 (**$2 intro**) \| $15 (**$10 intro**) \| intro pricing through 2026-08-31` | Keep as-is — already shows $3/$15 as base with intro noted (canonical); ensure the surrounding math (above) consumes $3/$15, not the intro figures. |

> The §9 margin-risk line (`71` L260) already frames post-intro $3/$15 correctly — leave it; it becomes the *base*, and the risk restates as "intro upside ends 2026-08-31."

---

## Summary table

| ID | Topic | Canonical value | Affected docs |
|----|-------|-----------------|---------------|
| **A01** | Hot-path transport | gRPC bidirectional streaming (HTTP/2) for `ws-gateway` ↔ `ai-orchestrator`; Redis off the per-frame audio path (control state only); cue return hop budgeted as its own line(s) | 02, 20, 21, 70 |
| **A02** | `billing-webhooks` placement | Canonical logical service; **NestJS module inside `services/api`** in v1; extractable to standalone at sustained webhook volume/latency | 02, 03, 13, 20, 51 |
| **A03** | Service path | `services/api` (and `services/ws-gateway`, `services/ai-orchestrator`, `services/entitlements`); **no `apps/api`** | 20, 40, 50, 51 |
| **A04** | `ai-orchestrator` framework | **NestJS application**, lean/standalone bootstrap on the hot path (no HTTP middleware on the gRPC path); all backend services are NestJS (`ws-gateway` via `uWebSockets`/`ws` adapter) | 02, 03, 13, 20 |
| **A05** | tsconfig source of truth | **`packages/config/tsconfig.base.json`**, extended everywhere; root `tsconfig.base.json` removed | 03 (13 canonical) |
| **A09** | DTO codegen direction | `api` Zod schemas → generated wire DTO types in `packages/types`, CI drift-checked; DB row types from Drizzle (separate axis) | 02, 13, 20, 30 |
| **SR-09** | Embedding model | **`voyage-3.5` @ 1024 dims**, query + document, end-to-end; column `= 1024`; CI guard against model/dim divergence | 21, 30 |
| **F-01** | Overage rate | **$0.13 / live minute** (canonical; ≈9× COGS; validate vs willingness-to-pay) | 51, 71, 50 |
| **F-07** | Sonnet pricing base case | **Post-intro $3 / $15 per 1M** as base; intro $2 / $10 (through 2026-08-31) shown only as expiring upside | 71 (21, 02 already aligned) |

---

## Open questions & risks

- **A01 — gRPC same-AZ latency under load is now the thing to prove.** The decision removes the Redis-stream SPOF but shifts the burden to validating gRPC bidi p95 (uplink 1–5 ms, return hop 1–5 ms) empirically under Growth-peak concurrency, and to confirming reconnect-resume works from Redis-held offsets without a stream to replay. Wire this into the load-test release gate ([Engineering standards §4](13-engineering-standards.md), [Scalability](70-scalability.md)).
- **A02 — extraction trigger must be measurable.** "Sustained webhook volume/latency" needs a concrete threshold (e.g. webhook p95 processing time contending with BFF request p95, or events/sec) so the extraction to `services/billing-webhooks` fires on data, not vibes.
- **A04 — "all backend services are NestJS" vs `ws-gateway`.** `ws-gateway` is NestJS only in the sense of a `uWebSockets`/`ws` adapter; confirm the adapter delivers the connection density ADR-003 assumes, or explicitly carve `ws-gateway` out as the one raw-transport edge to avoid re-opening this.
- **A09 — `packages/types` becomes generated for wire DTOs.** Confirm the codegen tool (Zod → types) and the drift-check command in the Turbo/CI pipeline, and document the ownership boundary with Drizzle-inferred DB types so contributors don't hand-edit generated files.
- **SR-09 — re-embedding runbook still owed.** Pinning `voyage-3.5` @ 1024 fixes the divergence, but a model upgrade later needs the documented re-embed + reindex + dual-write migration referenced in [Data model Open-Q](30-data-model.md#open-questions--risks).
- **F-01 — willingness-to-pay is unvalidated.** $0.13/min preserves the margin defense but is not yet tested against what heavy users (sales/CS/recruiters/job seekers — the adverse-selection tail in audit F-02) will actually tolerate before churning or capping usage. Gate on this before Pro GA.
- **F-07 — the cliff still bites the router.** Base-casing $3/$15 makes the model honest, but the router's post-2026-08-31 Sonnet-eligibility tightening ([AI pipeline Open-Q](21-ai-pipeline.md#open-questions--risks)) must actually ship, or Sonnet-heavy usage erodes margin exactly as the sensitivity grid shows.
- **Scope of this record.** These nine are the *contract-level* contradictions. They do **not** resolve the audit's hard launch blockers — third-party recording consent, the missing `90-legal-compliance.md`, sub-processor DPAs, and the interview-assistance responsible-use contradiction — which remain gating and are tracked in the [consolidated audit summary](audits/00-audit-summary.md#prioritized-remediation-roadmap) (items 1–4).
