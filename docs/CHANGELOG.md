# Changelog

All notable changes to the **AssistMe** (provisional brand; formerly Cue) architecture & business plan are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions here track the **planning/documentation set**, not the shipped software; product releases will be tracked separately once the [roadmap](80-roadmap.md) Phase 1 build begins.

## [Unreleased]

### Added

- **Native system-audio loopback (desktop)** — AssistMe can now hear the *other* participants, not just the local mic, via Electron `getDisplayMedia` + a main-process `audio:'loopback'` handler (ScreenCaptureKit macOS 13+ / WASAPI Windows, no native addon). A **Me / Them / Both** selector mixes mic + system into one 16 kHz stream, gated behind a **one-time in-app consent disclosure**. Implementation: [`apps/desktop/src/main/loopback.ts`](../apps/desktop/src/main/loopback.ts) + renderer `audio/capture-streams.ts`.
- **Local $0 backend stack** ([`../docker-compose.yml`](../docker-compose.yml)) — Postgres 16 + pgvector (migrations auto-apply on first init), Redis, and all three services (`api`, `ws-gateway`, `ai-orchestrator`) health-gated, so the desktop app runs in `gateway` mode entirely locally for free. **Built + booted for real:** postgres (15 tables + pgvector), redis, api (`/healthz` → `{"status":"ok"}`), ws-gateway all healthy; `ai-orchestrator` fail-loud-requires `ANTHROPIC_API_KEY`/`DEEPGRAM_API_KEY`, so it boots once those are set.
- **Free-tier hosting runbook** ([`62-free-tier-hosting.md`](62-free-tier-hosting.md)) — Neon (Postgres+pgvector) + Upstash (Redis) + Render (Docker services) so the deployed Vercel web gets a live backend at $0, with cold-start/limit caveats and a cost table. The cheap stand-in for the paid Terraform infra in [`60-devops-infrastructure.md`](60-devops-infrastructure.md).
- **`CORS_ORIGINS`** — comma-separated allowed-origins env on `api` so a hosted backend can accept the deployed web origin without overloading `WEB_BASE_URL`.
- **Desktop packaging enablement** — `electron`→devDependencies, `author`, and a zero-dependency icon generator (`apps/desktop/build/make-icon.py` → `build/icon.png`); verified by producing a real unsigned `AssistMe.app` + `.dmg` (arm64) locally. Runbook in [`../ai-context/05-setup-and-run.md`](../ai-context/05-setup-and-run.md).

### Changed

- **Rebrand Cue → AssistMe** (user-facing name only) across web copy/metadata/wordmark, docs, and the desktop display name. `@cue/*` package scope, `Cue*` identifiers, the `cue.v1` protocol, `window.cue`, and `CUE_*` env are unchanged.

- **Master index & reading guide** ([docs/README.md](README.md)) — product summary, "how to read this" ordering, a categorized index of every doc with one-line descriptions, the canonical tech-stack table, the NFR targets, and a gating responsible-use/compliance callout.
- **Five due-diligence audits** under [`docs/audits/`](audits/): [security](audits/01-security-audit.md) (72/100), [scalability & reliability](audits/02-scalability-reliability-audit.md) (68/100), [financial / unit economics](audits/03-financial-profitability-audit.md) (58/100), [architecture & code quality](audits/04-architecture-quality-audit.md) (78/100), and legal / compliance (46/100 — audit later removed as out of scope).
- **Consolidated audit summary** ([docs/audits/00-audit-summary.md](audits/00-audit-summary.md)) — scorecard, merged severity-ranked findings across all five audits, and a single prioritized remediation roadmap (top ~12 actions tagged by roadmap phase, with the legal/consent items flagged as gating).

### Fixed

- **Docker images never built** — all three service Dockerfiles called `pnpm deploy --prod --legacy`, but pinned **pnpm 9.12.3 rejects `--legacy`** (`Unknown option`). Removed the flag (the modern `deploy` works without it). Surfaced by actually running `docker compose up --build`.
- **api / ws-gateway crashed on boot in containers** — `@cue/observability`'s logger unconditionally used the `pino-pretty` transport, a dev-only dependency absent from `--prod` images (`unable to determine transport target for "pino-pretty"`). The logger now uses pretty **only when the transport is resolvable**, else structured JSON. Fixes [`packages/observability/src/logger.ts`](../packages/observability/src/logger.ts).

### Removed

- **Legal/compliance docs deprioritized** — removed `90-legal-compliance.md` and the legal/compliance audit (`audits/05-legal-compliance-audit.md`) as out of scope for the current pass. The underlying recording-consent / GDPR risk is unresolved and preserved in git history; revisit before any production audio capture.

## [0.4.0] - 2026-07-29

### Added

- **API contracts** ([22-api-contracts.md](22-api-contracts.md)) — canonical contract surface: REST/Zod schemas with code-generated DTOs, the **gRPC bidi** hot-path proto between `ws-gateway` and `ai-orchestrator`, and the versioned WebSocket message envelope.
- **Prompt & context spec** ([23-prompt-context-spec.md](23-prompt-context-spec.md)) — RAG context assembly over **`voyage-3.5`@1024** retrieval, context-window budgeting, prompt-cache layering, and per-tier Claude model routing.
- **Threat model** ([41-threat-model.md](41-threat-model.md)) — STRIDE/attack-surface analysis and trust boundaries covering per-org envelope encryption under KMS, KMS asymmetric JWT signing, the WS auth-ticket handshake, and supply-chain / signed-update integrity.
- **Test plan** ([14-test-plan.md](14-test-plan.md)) — test strategy and coverage matrix, the **two-budget latency** release gate (server-controllable from endpointing + full user-perceived p95), and capture-invisibility / audio-pipeline harnesses.
- **Phase 0 spike plan** ([81-phase-0-spike-plan.md](81-phase-0-spike-plan.md)) — de-risking spikes (capture-invisibility, gRPC bidi hot-path latency, STT/LLM two-budget validation) each with a hypothesis, method, and go/no-go exit criteria.

## [0.3.0] - 2026-07-29

### Added

- **Remediation plan** ([05-remediation-plan.md](05-remediation-plan.md)) — program that closes the audit's non-legal findings (security, scalability/reliability, financial, and architecture-quality), each with owner, roadmap phase, and concrete acceptance criteria.

### Changed

- **Latency SLO** rebuilt as a **two-budget model** (STT-partial budget vs. end-to-end cue budget), with the **< 1.2s p95** target enforced by an **end-to-end release gate** measured in CI rather than asserted.
- **Capacity & reliability** reconciled: **per-region capacity model** (with `eu-west-1` as the second region), an explicit **DR posture reconciled against the 99.9% SLO**, and **pgvector recall validation** added to the load-test matrix.
- **Data-at-rest security** hardened to **per-org envelope encryption** (per-tenant data keys under a KMS CMK), **KMS-backed JWT signing keys**, and **Redis reclassified as sensitive** (encrypted, access-scoped) rather than transient cache.
- **Software supply-chain program** added — SBOM generation, dependency provenance, and signed build attestations — **gating Electron `autoDownload`** and requiring a **signed update manifest** before any auto-update is applied.
- **WebSocket auth** hardened — the connection **ticket moved off the query string** to a header/subprotocol handshake to keep short-lived credentials out of logs and referrers.
- **Financial model** rebuilt bottom-up — **persona-segmented margin, churn, and LTV**; **bottom-up opex and CAC**; and a **cash break-even** analysis replacing the prior top-down sketch.

## [0.2.0] - 2026-07-29

### Added

- **Decision record** ([04-decision-record.md](04-decision-record.md)) — ADR-style reconciliation log that resolves the cross-doc contradictions surfaced by the [architecture & code-quality audit](audits/04-architecture-quality-audit.md) and the [audit summary](audits/00-audit-summary.md).
- **Legal & compliance governance doc** (`90-legal-compliance.md`) scaffold — jurisdictional recording-consent matrix, Acceptable-Use Policy, disclosed mode, DPA/sub-processor register, and data-subject-rights procedures; previously tracked as a **gating** Pending item. _(Removed in a later change — see [Unreleased].)_

### Changed

- **Hot-path transport** reconciled to **gRPC bidirectional streaming** between `ws-gateway` and `ai-orchestrator` (replacing the contradictory per-frame descriptions).
- **Service paths** made canonical as `services/api` (retiring stray `apps/api` references).
- **`billing-webhooks`** is an **`api` module for v1** (not a standalone service) to match the v1 scope.
- **`ai-orchestrator`** confirmed as a **NestJS** service, consistent with the rest of the backend.
- **TypeScript config** consolidated to a **single `packages/config/tsconfig.base.json`** as the shared base.
- **DTOs** are **code-generated from the `api` Zod schemas** — a single contract source of truth.
- **Embeddings** pinned to **`voyage-3.5` at 1024 dimensions**.
- **Overage pricing** made canonical at **$0.13/min**.
- **Post-intro Sonnet base pricing** set to **$3 / $15 per Mtok** (input / output).

## [0.1.0] - 2026-07-29

### Added

- **Initial architecture & business plan documentation set** for AssistMe — a cross-platform (macOS + Windows) real-time AI meeting & interview copilot with a content-protected, screen-share-invisible teleprompter overlay. The set establishes the canonical product definition, tech stack, non-functional targets, and business model. Documents authored in this release:
  - [00-executive-summary.md](00-executive-summary.md) — vision, market, and business model at a glance.
  - [01-product-vision.md](01-product-vision.md) — personas, use cases, scope, differentiation, and responsible-use summary.
  - [02-system-architecture.md](02-system-architecture.md) — high-level architecture, C4-ish views, data flow, sequence diagrams, and ADRs.
  - [03-repository-structure.md](03-repository-structure.md) — pnpm + Turborepo monorepo layout, package boundaries, and conventions.
  - [10-desktop-app.md](10-desktop-app.md) — Electron architecture, content protection, overlay, audio capture, updater, and IPC.
  - [11-web-landing.md](11-web-landing.md) — Next.js 15 + Three.js marketing site, download flow, and release-feed integration.
  - [12-design-system.md](12-design-system.md) — design language, tokens, components, overlay UX, accessibility, and motion.
  - [13-engineering-standards.md](13-engineering-standards.md) — code standards, code-splitting rules, testing, review, branching, and CI gates.
  - [20-backend-services.md](20-backend-services.md) — services (`api`, `ws-gateway`, `ai-orchestrator`, `entitlements`, `billing-webhooks`), API design, realtime gateway, queues, and inter-service contracts.
  - [21-ai-pipeline.md](21-ai-pipeline.md) — Deepgram STT + Claude LLM (Haiku/Sonnet/Opus) + RAG + streaming, latency budget, prompt design, and cost controls.
  - [30-data-model.md](30-data-model.md) — PostgreSQL 16 schema (DDL), pgvector embeddings, Redis usage, migrations, and data lifecycle.
  - [40-authentication.md](40-authentication.md) — AuthN/AuthZ, desktop OAuth 2.0 PKCE, device binding, RBAC, org/team model, and sessions.
  - [80-roadmap.md](80-roadmap.md) — phased delivery plan (Phase 0 spike → Phase 4 scale) with exit criteria, milestone gantt, team/hiring plan, prioritized risk register, and go-to-market sketch.
  - **This changelog** ([CHANGELOG.md](CHANGELOG.md)) — Keep a Changelog-style history of the planning set.

- **Canonical decisions codified across the set:**
  - Tech stack: pnpm + Turborepo monorepo, TypeScript everywhere, Node 22 LTS; Electron desktop (electron-builder/updater, React 19 + Vite + Zustand); Next.js 15 web; NestJS API + realtime WebSocket gateway; AWS ECS Fargate + Terraform; GitHub Actions CI/CD.
  - AI pipeline: Deepgram streaming STT (AssemblyAI fallback), Claude `claude-haiku-4-5` / `claude-sonnet-5` / `claude-opus-5`, Voyage AI embeddings with pgvector RAG, and Anthropic prompt caching.
  - Data: PostgreSQL 16 + pgvector, Redis, object storage (R2/S3), Drizzle ORM.
  - Auth & billing: Clerk/Auth.js + WorkOS SSO; Stripe Checkout/Billing/Tax/Portal feeding an entitlements service.
  - Pricing tiers: Free / Pro $20 / Team $30 per user / Enterprise (custom).
  - Non-functional targets: live cue end-to-end latency < 1.2s p95, STT partials < 300ms, backend API p99 < 200ms (excluding LLM), 99.9% uptime, and overlay invisibility across Zoom/Meet/Teams/Webex on both OSes.
  - Responsible-use posture: acceptable-use policy, consent/compliance model, and a disclosed mode as launch-blocking requirements.

[Unreleased]: https://example.com/cue/compare/v0.4.0...HEAD
[0.4.0]: https://example.com/cue/compare/v0.3.0...v0.4.0
[0.3.0]: https://example.com/cue/compare/v0.2.0...v0.3.0
[0.2.0]: https://example.com/cue/compare/v0.1.0...v0.2.0
[0.1.0]: https://example.com/cue/releases/tag/v0.1.0
