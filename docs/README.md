# Cue — Architecture & Business Plan

> Status: Draft · Owner: Architecture · Last updated: 2026-07-29

**Cue** (provisional brand) is a cross-platform (macOS + Windows) real-time AI meeting and interview copilot. It runs as a private, always-on-top, transparent teleprompter overlay that is excluded from screen capture and screen-share pickers using OS-level content-protection APIs. Cue captures both sides of a live conversation (system/loopback audio + microphone), transcribes it in under 300ms, and streams RAG-grounded AI cues, talking points, and live notes into the overlay — visible only to the user, at **< 1.2s end-to-end p95**. It targets interview preparation and confidence, sales/support copiloting, meeting note-taking, and accessibility.

This directory is the canonical planning set: product definition, architecture, delivery plan, and five independent due-diligence audits. Everything here is a **Draft** planning artifact, not shipped software.

---

## How to read this

1. **Start with the [Executive Summary](00-executive-summary.md)** for the pitch, market, business model, and one-screen architecture.
2. **Then [Product Vision](01-product-vision.md)** for personas, use cases, scope, and the responsible-use posture.
3. **Then [System Architecture](02-system-architecture.md)** for the authoritative C4 views, data flow, sequence diagrams, and ADRs.
4. **Drill into the domain docs** that matter to your role — client (10–13), backend & AI (20–21), data & auth (30–40), monetization (50–51, 71), infra & ops (60–61, 70).
5. **Read the [Roadmap](80-roadmap.md)** for the phase-gated delivery plan (Phase 0 spike → Phase 4 scale) and risk register.
6. **Finish with the [Consolidated Audit Summary](audits/00-audit-summary.md)** — it is the single most important cross-cutting document before any build decision. The legal/consent items there are **gating**.

> Note: the audit's cross-doc contradictions (hot-path transport, service topology, contract sources of truth, embeddings, and pricing) have been reconciled — see the [Decision Record](04-decision-record.md) for the canonical resolutions.

---

## Document index

### Foundation

| Doc | Description |
|-----|-------------|
| [00-executive-summary.md](00-executive-summary.md) | The pitch, problem, TAM sketch, competitive landscape, business model, moat, one-screen architecture, and key metrics. |
| [01-product-vision.md](01-product-vision.md) | Personas, use cases, jobs-to-be-done, scope, differentiation, and the responsible-use summary. |
| [02-system-architecture.md](02-system-architecture.md) | Authoritative architecture: C4-ish views, data flow, live-cue sequence diagrams, and ADRs. |
| [03-repository-structure.md](03-repository-structure.md) | pnpm + Turborepo monorepo layout, package boundaries, and layering conventions. |
| [04-decision-record.md](04-decision-record.md) | Reconciliation decision log resolving the audit's cross-doc contradictions — canonical transport, service topology, contract sources of truth, embeddings, and pricing. |

### Frontend & Client

| Doc | Description |
|-----|-------------|
| [10-desktop-app.md](10-desktop-app.md) | Electron architecture, content protection, overlay UX, audio capture, auto-updater, and typed IPC. |
| [11-web-landing.md](11-web-landing.md) | Next.js 15 + Three.js marketing site, download flow, and signed release-feed integration. |
| [12-design-system.md](12-design-system.md) | Design language, tokens, components, overlay UX, accessibility, and motion. |
| [13-engineering-standards.md](13-engineering-standards.md) | Code standards, code-splitting rules, testing, review, branching, and CI gates. |

### Backend & AI

| Doc | Description |
|-----|-------------|
| [20-backend-services.md](20-backend-services.md) | Services (`api`, `ws-gateway`, `ai-orchestrator`, `entitlements`, `billing-webhooks`), API design, realtime gateway, and inter-service contracts. |
| [21-ai-pipeline.md](21-ai-pipeline.md) | Deepgram STT + Claude (Haiku/Sonnet/Opus) + RAG streaming, latency budget, prompt design, and cost controls. |

### Data & Auth

| Doc | Description |
|-----|-------------|
| [30-data-model.md](30-data-model.md) | PostgreSQL 16 schema (DDL), pgvector embeddings, Redis usage, migrations, RLS, and data lifecycle. |
| [40-authentication.md](40-authentication.md) | AuthN/AuthZ, desktop OAuth 2.0 PKCE, device binding, RBAC, org/team model, sessions, and consent records. |

### Monetization

| Doc | Description |
|-----|-------------|
| [50-subscriptions-entitlements.md](50-subscriptions-entitlements.md) | Tiers, feature gates, entitlements as source of truth, quota/metering, and trial mechanics. |
| [51-payments-stripe.md](51-payments-stripe.md) | Stripe Checkout/Billing/Tax/Portal integration, catalog, webhooks, and PCI SAQ-A scoping. |
| [71-unit-economics.md](71-unit-economics.md) | Per-session COGS model, margins, LTV/CAC, break-even, and sensitivity analysis. |

### Infra & Ops

| Doc | Description |
|-----|-------------|
| [60-devops-infrastructure.md](60-devops-infrastructure.md) | AWS ECS Fargate + Terraform, CI/CD, code signing/notarization, release feed, secrets, and backups. |
| [61-observability.md](61-observability.md) | Tracing, metrics, latency budget of record, SLOs/error budgets, and alerting. |
| [70-scalability.md](70-scalability.md) | Capacity model, bottleneck taxonomy, autoscaling, degradation ladder, and load-testing matrix. |

### Business

| Doc | Description |
|-----|-------------|
| [80-roadmap.md](80-roadmap.md) | Phase-gated delivery plan (Phase 0 → 4), exit criteria, milestone gantt, hiring plan, risk register, and GTM sketch. |
| [CHANGELOG.md](CHANGELOG.md) | Keep-a-Changelog-style history of the planning/documentation set. |

### Legal & Compliance

| Doc | Description |
|-----|-------------|
| [90-legal-compliance.md](90-legal-compliance.md) | Authoritative compliance governance: jurisdictional recording-consent matrix, Acceptable-Use Policy, disclosed mode, DPA/sub-processor register, and data-subject-rights procedures. |

### Audits

| Doc | Description |
|-----|-------------|
| [audits/00-audit-summary.md](audits/00-audit-summary.md) | Consolidated scorecard, merged severity-ranked findings, and the prioritized remediation roadmap. |
| [audits/01-security-audit.md](audits/01-security-audit.md) | Security due-diligence: supply chain, data-at-rest, third-party egress, auth, and update integrity. Score **72/100**. |
| [audits/02-scalability-reliability-audit.md](audits/02-scalability-reliability-audit.md) | Scalability & reliability: Redis hot path, capacity model, latency SLO, and DR posture. Score **68/100**. |
| [audits/03-financial-profitability-audit.md](audits/03-financial-profitability-audit.md) | Unit economics & profitability: overage pricing, adverse selection, churn/LTV, and break-even. Score **58/100**. |
| [audits/04-architecture-quality-audit.md](audits/04-architecture-quality-audit.md) | Architecture & code quality: hot-path transport, v1 scope contradictions, and contract sources of truth. Score **78/100**. |
| [audits/05-legal-compliance-audit.md](audits/05-legal-compliance-audit.md) | Legal, compliance, privacy & responsible use: recording-consent law, GDPR, DPAs, and the AUP. Score **46/100**. |

---

## Canonical tech stack

| Layer | Choice |
|-------|--------|
| **Monorepo & language** | pnpm + Turborepo, TypeScript everywhere, Node 22 LTS toolchain |
| **Desktop** | Electron 32 (embedded Node 20 runtime), React 19 + Vite + Zustand, electron-builder / electron-updater |
| **Web** | Next.js 15 + Three.js (marketing, downloads, release feed) |
| **Backend services** | NestJS `api` (BFF), `ws-gateway` (realtime), `ai-orchestrator`, `entitlements`, `billing-webhooks` |
| **AI — STT** | Deepgram streaming STT (AssemblyAI fallback) |
| **AI — LLM** | Anthropic Claude `claude-haiku-4-5` / `claude-sonnet-5` / `claude-opus-5`, with prompt caching |
| **AI — Embeddings / RAG** | Voyage AI embeddings + pgvector |
| **Data** | PostgreSQL 16 + pgvector, Redis, object storage (Cloudflare R2 / S3), Drizzle ORM |
| **Auth & identity** | Clerk / Auth.js + WorkOS SSO/SAML/SCIM; OAuth 2.0 PKCE (desktop), device binding |
| **Billing** | Stripe Checkout / Billing / Tax / Customer Portal → `entitlements` service |
| **Infra & CI/CD** | AWS ECS Fargate, Terraform (IaC), GitHub Actions, CDN + signed auto-update feed |

---

## Non-functional targets (canonical)

| Metric | Target |
|--------|--------|
| Live cue end-to-end latency (audio → visible cue) | **< 1.2s p95** |
| STT partial results | **< 300ms** |
| Backend API latency (excl. LLM) | **p99 < 200ms** |
| Uptime | **99.9%** |
| Overlay capture-invisibility | 100% across Zoom/Meet/Teams/Webex + full-screen recording, both OSes |

> These targets are asserted in the plan but several are contested by the audits — the latency SLO measurement method and the 99.9% target under a no-cross-region-failover DR posture are flagged in the [Scalability & Reliability audit](audits/02-scalability-reliability-audit.md). Treat them as goals pending reconciliation, not commitments.

---

## Responsible use & compliance

> **⚠️ Gating before any production audio capture.** Cue captures the *other party's* voice. In all-party-consent jurisdictions (≈12 U.S. states and much of the EU) this can be a criminal wiretapping offense, and it creates GDPR obligations toward a non-consenting third party for which the current plan establishes no lawful basis. The authoritative governing document, [`90-legal-compliance.md`](90-legal-compliance.md) (jurisdictional consent matrix, Acceptable-Use Policy, DPA/sub-processor register, data-subject-rights procedures), **now exists as a draft scaffold** but the substantive gating work is not done: consent still defaults to the risky posture (`disclosed = false`), and DPAs with AI sub-processors are currently deferred to Phase 3 rather than Phase 1.
>
> These are launch-blocking. Read the [Legal, Compliance, Privacy & Responsible-Use audit](audits/05-legal-compliance-audit.md) (score **46/100**) and the gating items in the [Audit Summary](audits/00-audit-summary.md#prioritized-remediation-roadmap) before committing to a build timeline.
