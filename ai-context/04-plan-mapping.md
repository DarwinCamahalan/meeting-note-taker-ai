# 04 — Plan ↔ As-Built Mapping

> For future AI: [`../docs/`](../docs/) is the **intended design** (the plan). This directory is **what was actually built**. This file is the bridge: for each plan doc it says what the code delivers, what deviates, and what is unbuilt. It also records how the two governance docs — the [decision record](../docs/04-decision-record.md) and the [remediation plan](../docs/05-remediation-plan.md) — landed (or didn't) in code, and it states the **legal descope** plainly. Read [`03-build-journal.md`](03-build-journal.md) for the chronology first.

## How to use this

The plan is aspirational and detailed; the code is a **thin, honest slice** of it that grows phase by phase. When the plan and the code disagree, **the code wins for "what is"** and the plan wins for "what was intended." Three recurring deviation patterns:

1. **Env-gated degradation** — a planned production behavior (KMS, Redis, real IdP) ships as a dev-grade fallback that activates only when the relevant env var is set. Unset ⇒ prior-phase behavior.
2. **Simplified contract** — the built wire/API surface is a subset of the doc (e.g. the gRPC 3+3 oneof vs `docs/22` §6; the four PKCE routes vs the fuller `/auth/token` surface).
3. **Stub with a loud failure** — a planned capability exists as an interface that throws or reports `isSupported=false` (loopback capture) rather than silently no-op'ing.

---

## Plan doc → built artifact

| Plan doc | Built as | Fidelity | Notes / deviations |
|----------|----------|----------|--------------------|
| `00-executive-summary` / `01-product-vision` | Product framing across all surfaces | n/a | Positioning (prep/copilot/accessibility, not deception) carried in [`../RULES.md`](../RULES.md). |
| `02-system-architecture` | `services/*` + `apps/*` + `packages/*` wiring | High | Hot path is **gRPC bidi** ws-gateway↔ai-orchestrator (ADR A01). Redis off the audio path. See [`01-architecture-as-built.md`](01-architecture-as-built.md). |
| `03-repository-structure` | The 12-workspace monorepo | High | `services/api` canonical (A03); single `packages/config/tsconfig.base.json` (A05). |
| `10-desktop-app` | `apps/desktop` | Medium | Content protection + mic capture + PKCE + updater real. **Loopback capture stubbed.** WS ticket handshake per S-07 intent. |
| `11-web-landing` | `apps/web` | High | Landing/pricing/download/activate + Three.js hero + `/api/latest-release` + `/admin`. |
| `12-design-system` | overlay + web UI components | Medium | Applied ad hoc in components; no separate published token package. |
| `13-engineering-standards` | code-splitting, strict TS, CI gates | High | `<700 LOC`, hooks/utils/types split obeyed. CI supply-chain gates real; **e2e latency gate not implemented**. |
| `14-test-plan` | — | **Low** | Unit tests exist per package; the utterance→painted-token latency harness + gateway e2e are **not built**. |
| `20-backend-services` | `services/api`, `ai-orchestrator`, `ws-gateway` | High | Four logical services; `billing-webhooks` is a **module in `api`** (A02). |
| `21-ai-pipeline` | `@cue/core` + `ai-orchestrator` | High | Deepgram STT + Claude `claude-haiku-4-5` streaming + RAG. Model routing to Sonnet/Opus is not exercised in code (Haiku only on the built cue path). |
| `22-api-contracts` | `@cue/proto`, api Zod schemas, `@cue/sdk` | Medium | gRPC **simplified 3+3 oneof**; PKCE **four routes** only. Zod-as-truth → derived `@cue/types` (A09) — done by convention, **no CI drift-check job**. |
| `23-prompt-context-spec` | `@cue/core` context-provider + `rag/` | High | `voyage-3.5`@1024 for both document + query (SR-09). |
| `30-data-model` | `@cue/db` (15 tables, pgvector, migrations 0000–0002) | High | Schema real. **Envelope encryption not implemented** (content columns are plaintext; TODO in schema comments). |
| `40-authentication` | `api` auth module (PKCE, ES256, RBAC) | Medium | PKCE + ES256 + RBAC real. **KMS asymmetric signing not implemented** (local/ephemeral keypair). Real IdP not wired. |
| `41-threat-model` | reliability/redaction/updater controls | Partial | PII redaction + signed-update integrity real; KMS/envelope-encryption controls are TODO. |
| `50-subscriptions-entitlements` | `EntitlementsModule` + `entitlements` table | High | `@RequireEntitlement` guard real; overage rate $0.13/min (F-01). |
| `51-payments-stripe` | `BillingModule` + `BillingWebhooksModule` | High | Checkout/portal/usage/webhook real; webhook dedupe **in-memory** (TODO durable table). |
| `60-devops-infrastructure` | `infra/` Terraform + `.github/workflows/` | Medium | Modules + envs + CI/CD real and validated; **not applied**; skeleton caveats in [`infra/README.md`](../infra/README.md) §9. |
| `61-observability` | `@cue/observability` | High | OTel/pino/Prometheus/Sentry real. SLO/SLI definitions carried in docs; `cue_server_latency_ms` metric present, **not gated in CI**. |
| `70-scalability` | rate-limit, ws caps, regional admission | Medium | Per-region admission budgets (`CLAUDE_RPM_LIMIT`/`STT_CONCURRENCY`) + Redis control cluster real; capacity model is doc-only. |
| `71-unit-economics` | — | n/a | Financial model; prices reflected in `stripe.catalog.ts` ($0.13/min, $20/$30). |
| `80-roadmap` / `81-phase-0-spike-plan` | the phase structure itself | High | Phases 0–4 delivered as PRs #6–#10. |
| `90-legal-compliance` | **removed** | — | **Descoped** (PR #2). See [below](#the-legal-descope). |

---

## Decision record — did the ADRs land in code? {#decision-record}

The [decision record](../docs/04-decision-record.md) resolved nine contract-level contradictions. Status in the built code:

| ID | Canonical decision | Built? | Evidence |
|----|--------------------|--------|----------|
| **A01** | gRPC bidi hot path; Redis off audio path | ✅ | `@cue/proto` `cue.orchestrator.v1`; ws-gateway↔ai-orchestrator over gRPC; no audio in Redis. |
| **A02** | `billing-webhooks` = module in `services/api` (v1) | ✅ | `services/api/src/modules/billing-webhooks/`. Not a separate service. |
| **A03** | Canonical `services/api`; no `apps/api` | ✅ | Services under `services/`; clients under `apps/`. |
| **A04** | `ai-orchestrator` is NestJS, lean bootstrap | ✅ | NestJS + `@grpc/grpc-js` server, no HTTP middleware on the gRPC path. |
| **A05** | Single `packages/config/tsconfig.base.json` | ✅ | Every workspace extends it; no root base config. |
| **A09** | Zod-as-truth → generated `@cue/types`; CI drift-check | ⚠️ Partial | Zod is source of truth and types are derived **by convention**; the **CI drift-check job is not implemented**. |
| **SR-09** | `voyage-3.5`@1024 for query + document | ✅ | `VoyageEmbeddingsClient`; `document_chunks.embedding vector(1024)`. The **CI guard test against model/dim divergence is not present**. |
| **F-01** | Overage $0.13/live-minute | ✅ | `stripe.catalog.ts`; `.env.example` `STRIPE_PRICE_OVERAGE`. |
| **F-07** | Post-intro Sonnet $3/$15 base case | n/a (doc/finance) | Not a code artifact; Sonnet routing itself is unexercised on the built path. |

**Takeaway:** the *structural* ADRs (A01–A05) are fully realized in the layout and transport. The *guardrail* ADRs (A09 drift-check, SR-09 divergence guard) are honored in spirit but **their CI enforcement is missing** — a contributor could reintroduce drift without a red build. Tracked in [`07-todos-and-gaps.md`](07-todos-and-gaps.md).

---

## Remediation plan — did the hardening land? {#remediation-plan}

The [remediation plan](../docs/05-remediation-plan.md) defined five workstreams (RM-LAT, RM-CAP, RM-ENC, RM-SC, RM-FIN). These were largely **doc-level** remediations; the code picked up the pieces that were buildable in Phase 4:

| Workstream | Intent | Built in code? |
|------------|--------|----------------|
| **RM-LAT** (two-budget latency + release gate) | server-controllable <900 ms + user-perceived <1.2 s, CI gate | ⚠️ `cue_server_latency_ms` metric exists in `@cue/observability`; the **release gate + harness are not built**. |
| **RM-CAP** (per-region capacity, Redis split, regional admission) | regional budgets, control/session Redis split | ⚠️ **Per-region admission** built (`CLAUDE_RPM_LIMIT`/`STT_CONCURRENCY`, never a global pool); **control-Redis** (`REDIS_URL`) present; the session-Redis split + capacity model are doc-only. |
| **RM-ENC** (envelope encryption, KMS JWT, Redis-as-sensitive, WS ticket off query string) | launch-grade crypto | ⚠️ **WS ticket off the query string** built; **envelope encryption + KMS JWT signing not built** (documented TODOs in schema + `jwt.service.ts`). |
| **RM-SC** (supply-chain program gating auto-download + signed manifest) | SBOM/provenance/secret-scan gates, independent manifest signing | ✅ Mostly: `ci.yml` runs `pnpm audit` + gitleaks + CycloneDX SBOM + provenance attestation; `release-desktop.yml` does independent **minisign** manifest signing + tamper-rejection gate; the desktop updater verifies the manifest signature first. (Pinned public key is still a placeholder.) |
| **RM-FIN** (financial rebuild) | persona-segmented model | n/a (doc-only). |

**Takeaway:** RM-SC is the best-realized remediation (it was inherently CI/build work). RM-ENC and RM-LAT landed their cheap halves (WS ticket handshake, the latency metric) and left the expensive halves (KMS, envelope encryption, the latency release gate) as tracked TODOs.

---

## The legal descope {#the-legal-descope}

**Legal, compliance, and recording-consent work is out of scope by decision, not by oversight.**

- PR #2 (`cc85267`) **removed** `90-legal-compliance.md` and the legal/compliance audit (`audits/05-legal-compliance-audit.md`). The [CHANGELOG](../docs/CHANGELOG.md) records this under *Removed*.
- Both the [decision record](../docs/04-decision-record.md) (scope note) and the [remediation plan](../docs/05-remediation-plan.md) §2 explicitly state the legal/consent items (recording consent, the governing legal document, sub-processor DPAs, the interview-assistance responsible-use contradiction) are **hard launch blockers tracked separately** and **not resolved** by those docs.
- **Residual risk (real, unresolved):** any production audio capture — especially the *other party's* audio via loopback — carries jurisdictional recording-consent and GDPR exposure. The code reflects this: **system-audio loopback is deliberately stubbed** ([`packages/core/src/audio/loopback.ts`](../packages/core/src/audio/loopback.ts)) and gated behind this descoped consent work. Microphone-only capture is the shipped path.

**Rule for future AI:** do **not** re-introduce legal docs or a consent/disclosed-mode implementation as part of unrelated work. Document the descope + residual risk; escalate to the user before building anything that captures a third party's audio. See [`07-todos-and-gaps.md`](07-todos-and-gaps.md#descoped-legal--consent).

## See also

- [`03-build-journal.md`](03-build-journal.md) — the phase-by-phase chronology.
- [`07-todos-and-gaps.md`](07-todos-and-gaps.md) — the consolidated stub/TODO list this file references.
- [`01-architecture-as-built.md`](01-architecture-as-built.md) — the real runtime wiring behind the ADRs.
</content>
