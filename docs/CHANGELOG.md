# Changelog

All notable changes to the **Cue** (provisional brand) architecture & business plan are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions here track the **planning/documentation set**, not the shipped software; product releases will be tracked separately once the [roadmap](80-roadmap.md) Phase 1 build begins.

## [Unreleased]

### Added

- **Master index & reading guide** ([docs/README.md](README.md)) — product summary, "how to read this" ordering, a categorized index of every doc with one-line descriptions, the canonical tech-stack table, the NFR targets, and a gating responsible-use/compliance callout.
- **Five due-diligence audits** under [`docs/audits/`](audits/): [security](audits/01-security-audit.md) (72/100), [scalability & reliability](audits/02-scalability-reliability-audit.md) (68/100), [financial / unit economics](audits/03-financial-profitability-audit.md) (58/100), [architecture & code quality](audits/04-architecture-quality-audit.md) (78/100), and [legal / compliance](audits/05-legal-compliance-audit.md) (46/100).
- **Consolidated audit summary** ([docs/audits/00-audit-summary.md](audits/00-audit-summary.md)) — scorecard, merged severity-ranked findings across all five audits, and a single prioritized remediation roadmap (top ~12 actions tagged by roadmap phase, with the legal/consent items flagged as gating).

### Pending

- Compliance/legal deep-dive `90-legal-compliance.md` (acceptable-use policy, consent model, disclosed mode, jurisdictional recording-law matrix, DPA/sub-processor register) — flagged as a **gating** launch blocker by the [legal/compliance audit](audits/05-legal-compliance-audit.md) and the [audit summary](audits/00-audit-summary.md); currently only summarized in [01-product-vision.md](01-product-vision.md).

## [0.2.0] - 2026-07-29

### Added

- **Decision record** ([04-decision-record.md](04-decision-record.md)) — ADR-style reconciliation log that resolves the cross-doc contradictions surfaced by the [architecture & code-quality audit](audits/04-architecture-quality-audit.md) and the [audit summary](audits/00-audit-summary.md).
- **Legal & compliance governance doc** ([90-legal-compliance.md](90-legal-compliance.md)) scaffold — jurisdictional recording-consent matrix, Acceptable-Use Policy, disclosed mode, DPA/sub-processor register, and data-subject-rights procedures; previously tracked as a **gating** Pending item.

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

- **Initial architecture & business plan documentation set** for Cue — a cross-platform (macOS + Windows) real-time AI meeting & interview copilot with a content-protected, screen-share-invisible teleprompter overlay. The set establishes the canonical product definition, tech stack, non-functional targets, and business model. Documents authored in this release:
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

[Unreleased]: https://example.com/cue/compare/v0.2.0...HEAD
[0.2.0]: https://example.com/cue/compare/v0.1.0...v0.2.0
[0.1.0]: https://example.com/cue/releases/tag/v0.1.0
