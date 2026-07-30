# 07 — TODOs & Gaps (What's Real vs Stubbed)

> For future AI: this is the honest inventory. Cue's `dev` branch is a **working thin slice**, not a production system — many production behaviors ship as dev-grade fallbacks or loud stubs. Every entry below is grep-verified against real source with a file path. Before you rely on a feature, check it here. Read [`04-plan-mapping.md`](04-plan-mapping.md) for how these gaps map to the plan, and [`03-build-journal.md`](03-build-journal.md) for when each was introduced.

## The short version

- **The core loop is real** (mic → Deepgram → Claude → overlay), and every phase's *structure* is real (services, schema, contracts, CI, Terraform).
- **Production-grade security/durability is mostly deferred**: no KMS signing, no envelope encryption, in-memory stores, no real IdP, Terraform unapplied.
- **`main` is held** at the v0.4.0 plan baseline; the as-built code is on `dev`. Do not promote without instruction.
- **Legal/consent is descoped** with a real residual risk — see [below](#descoped-legal--consent).

Severity legend: 🔴 blocks production · 🟡 works in dev, needs real backing · 🟢 minor / cosmetic.

---

## Capture & audio

| Gap | Sev | Where | Detail |
|-----|-----|-------|--------|
| **System-audio loopback not implemented** | 🔴 | [`packages/core/src/audio/loopback.ts`](../packages/core/src/audio/loopback.ts) | `NotImplementedLoopbackCapture` reports `isSupported=false` and **throws on `start()`**. Only **microphone** capture works. Real loopback needs native ScreenCaptureKit (macOS 14.4+ Core Audio process taps) / WASAPI (Windows) bindings — and is **gated behind the descoped consent work**. Do not build it without escalating consent/legal. |
| Renderer uses an inline AudioWorklet | 🟢 | [`apps/desktop/src/renderer/hooks/use-audio-capture.ts`](../apps/desktop/src/renderer/hooks/use-audio-capture.ts) | `TODO(phase-1)`: ship a bundled AudioWorklet instead of the spike inline one. |
| Global Escape shortcut swallows Escape | 🟢 | [`apps/desktop/src/main/shortcuts.ts`](../apps/desktop/src/main/shortcuts.ts) | `TODO(phase-1)`: registering Escape globally swallows it elsewhere. |

## Authentication & identity

| Gap | Sev | Where | Detail |
|-----|-----|-------|--------|
| **No real IdP — dev auto-approve** | 🔴 | [`services/api/.../auth/auth.service.ts`](../services/api/src/modules/auth/auth.service.ts), [`apps/desktop/src/main/auth.ts`](../apps/desktop/src/main/auth.ts), [`apps/web/features/activate/types.ts`](../apps/web/features/activate/types.ts) | The `/activate` PKCE flow **auto-approves a shared dev identity**. `TODO(real IdP: Clerk/WorkOS)`: derive identity from an approved IdP subject. |
| **JWT signing is local/ephemeral, not KMS** | 🔴 | [`services/api/.../auth/jwt.service.ts`](../services/api/src/modules/auth/jwt.service.ts), [`config/app-config.ts`](../services/api/src/config/app-config.ts) | ES256 keypair from `.env`, or an **ephemeral keypair generated at boot** if unset (tokens don't survive a restart). `TODO(prod: KMS asymmetric signing per docs/40 §2.3)` — sign via `kms:Sign` against an `ECC_NIST_P256` CMK; publish JWKS from the public key. |
| **In-memory device-code store** | 🔴 | [`services/api/.../auth/device-code.store.ts`](../services/api/src/modules/auth/device-code.store.ts) | `TODO(prod: Redis/IdP)`: single-instance only; a multi-instance deploy needs a shared Redis-backed store. |
| Web refresh token is JS-readable | 🟡 | [`apps/web/lib/auth/client-session.ts`](../apps/web/lib/auth/client-session.ts) | `SECURITY TODO(phase-3-hardening)`: XSS-exposed refresh token; move to httpOnly cookie. Tracked with the SSO callback token-in-URL TODO. |
| SSO callback leaks token via URL | 🟡 | [`apps/web/app/sso/callback/route.ts`](../apps/web/app/sso/callback/route.ts) | `TODO`: the api SsoModule callback contract passes the token in the URL; harden to httpOnly cookie. |

## Gateway & realtime

| Gap | Sev | Where | Detail |
|-----|-----|-------|--------|
| **In-memory replay + offset stores** | 🔴 | [`ws-gateway/src/auth/replay-store.ts`](../services/ws-gateway/src/auth/replay-store.ts), [`resume/offset-store.ts`](../services/ws-gateway/src/resume/offset-store.ts) | Ticket replay-guard and WS resume offsets are per-instance. `TODO(prod: Redis SETNX with TTL)` / `TODO(prod: Redis)` — required before running more than one gateway instance. |
| gRPC channel is plaintext | 🟡 | [`ai-orchestrator/src/grpc/grpc-server.service.ts`](../services/ai-orchestrator/src/grpc/grpc-server.service.ts) | `TODO(prod)`: terminate TLS via ECS Service Connect / mTLS. |
| Protocol gaps (upstream error codes, Ask RPC) | 🟢 | [`ws-gateway/src/connection.ts`](../services/ws-gateway/src/connection.ts), [`protocol/mapping.ts`](../services/ws-gateway/src/protocol/mapping.ts) | Several `TODO(protocol)`: no distinct `WS_UPSTREAM` code; ERROR state not surfaced as a client frame; no explicit Ask RPC / control envelope. |

## Data & encryption

| Gap | Sev | Where | Detail |
|-----|-----|-------|--------|
| **No per-org envelope encryption** | 🔴 | [`packages/db/src/schema/sessions.ts`](../packages/db/src/schema/sessions.ts), [`documents.ts`](../packages/db/src/schema/documents.ts) | `transcript_segments.content`, `transcripts.summary`, `document_chunks.content` store **plaintext**. Schema comments mark them as `per-org envelope-encrypted; TODO`. RM-ENC intended a per-org DEK under a KMS CMK — **not built**. |
| **Postgres/pgvector provisioning is dev-only** | 🟡 | [`packages/db/migrations/0000_init.sql`](../packages/db/migrations/), README | Local dev uses the `pgvector/pgvector:pg16` Docker image and a SQL `uuidv7()` shim in `0000`. Provision managed Postgres 16 + pgvector and prefer the `pg_uuidv7` extension for real environments. |
| Redis not yet reclassified/hardened | 🟡 | infra + auth docs | RM-ENC calls for ElastiCache in-transit + at-rest + AUTH and internal TLS; the app only consumes `REDIS_URL` (control cluster). |
| Webhook dedupe is in-memory | 🟡 | [`api/.../billing-webhooks/webhook-dedupe.store.ts`](../services/api/src/modules/billing-webhooks/webhook-dedupe.store.ts) | `TODO(durable)`: add a `processed_webhook_events(event_id PK)` table in `@cue/db`. Restart loses dedupe state. |

## Billing, entitlements & documents

| Gap | Sev | Where | Detail |
|-----|-----|-------|--------|
| No presigned large-document upload | 🟡 | [`api/.../documents/documents.service.ts`](../services/api/src/modules/documents/documents.service.ts), [`contracts/documents.contract.ts`](../services/api/src/contracts/documents.contract.ts) | Inline text only; `documents.storageKey` presigned flow is `TODO(phase-2+)`. |
| Session↔document scope join not persisted | 🟢 | [`api/.../sessions/sessions.mapper.ts`](../services/api/src/modules/sessions/sessions.mapper.ts) | `TODO(MVP)`: session-to-document scope is empty until a join table exists. |
| Entitlements catalog lives in `api`, not `@cue/core` | 🟢 | [`api/.../entitlements/entitlements.catalog.ts`](../services/api/src/modules/entitlements/entitlements.catalog.ts) | `TODO(phase-3)`: promote so `ws-gateway` can resolve gates too. |
| Some entitlement/subscription fields inferred | 🟢 | [`api/.../entitlements/types.ts`](../services/api/src/modules/entitlements/types.ts), [`billing/stripe.catalog.ts`](../services/api/src/modules/billing/stripe.catalog.ts) | `TODO(schema)`: dedicated `tier`/`version`/`status` columns not yet in `@cue/db`; `interval` accepted but not fully modeled. |

## Enterprise (SSO/SCIM/admin)

| Gap | Sev | Where | Detail |
|-----|-----|-------|--------|
| **WorkOS wired but not connected to a live IdP** | 🟡 | [`api/.../sso/workos.service.ts`](../services/api/src/modules/sso/workos.service.ts) | Code paths exist; connections read `not yet connected` until a real WorkOS org is configured. `TODO(prod)`: pin webhook `tolerance`, add per-connection state signing. |
| Org settings partially persisted | 🟡 | [`api/.../admin/admin.service.ts`](../services/api/src/modules/admin/admin.service.ts), [`admin.mapper.ts`](../services/api/src/modules/admin/admin.mapper.ts) | `allowDomainJoin` / `defaultMemberRole` have no column; only `name`/`slug` persist, the rest are logged. `TODO(phase-3, needs DB migration)`. |
| Invite emails not sent | 🟡 | [`api/.../orgs/invites.service.ts`](../services/api/src/modules/orgs/invites.service.ts) | Raw accept token is **logged, not emailed**. `TODO(phase-3)`: deliver by email. |

## Desktop auto-update

| Gap | Sev | Where | Detail |
|-----|-----|-------|--------|
| **Pinned update public key is a placeholder** | 🔴 | [`apps/desktop/src/main/updater.ts`](../apps/desktop/src/main/updater.ts) | `TODO(devops, docs/60)`: inject the real pinned `UPDATE_MANIFEST_PUBLIC_KEY`. The independent minisign verification logic is built; it needs the real key before `autoDownload` is trusted. |

## CI enforcement gaps (the guards the ADRs asked for)

| Gap | Sev | Detail |
|-----|-----|--------|
| **No DTO drift-check job (A09)** | 🟡 | Zod is the source of truth and `@cue/types` is derived **by convention**; the `turbo run codegen:check` drift gate is **not implemented** — a contributor can silently diverge types. |
| **No embedding divergence guard (SR-09)** | 🟡 | `voyage-3.5`@1024 is used for both query + document, but the CI guard test that fails on model/dimension divergence is **not present**. |
| **No e2e / gateway integration test** | 🔴 | Nothing exercises desktop → ws-gateway → ai-orchestrator → back end-to-end. Add one before relying on the gateway path. |
| **No two-budget latency release gate (RM-LAT)** | 🔴 | The `cue_server_latency_ms` metric exists in `@cue/observability`, but the utterance→painted-token harness + the `<900 ms` / `<1.2 s` CI release gate (docs/14) are **not built**. Latency targets remain unvalidated. |

## Infrastructure (Terraform skeleton)

Terraform under [`../infra/`](../infra/) is **validated but not applied**. Caveats to wire before a first prod apply (from [`../infra/README.md`](../infra/README.md) §9):

- 🔴 **gRPC over the internal ALB needs TLS** — a gRPC target group needs an HTTPS/HTTP2 listener; the `HTTP:8443` dev fallback is single-region-dev only. Real deployments reach ai-orchestrator via Service Connect or the internal ALB with a regional cert.
- 🟡 **Images must be ARM64** (`runtime_platform = ARM64`, Graviton) — build multi-arch/arm64 in `deploy.yml` or flip to `X86_64`.
- 🟡 **S3 cross-region replication** is declared but the replication rule is left to wire once both regions + KMS replica-key grants exist.
- 🟡 **PgBouncer** (connection pooling) is an app/sidecar concern, not provisioned here.
- 🟡 **`backend.tf` state backend is a placeholder** — wire per-env/region before first apply.

## Branch state

- 🟡 **`main` is intentionally held** at the v0.4.0 plan-docs baseline; all as-built code (Phases 0–4) is on **`dev`**. `main` is ~26 commits behind and contains no code. Promotion to `main` is pending a local build/validation pass — do **not** promote without an explicit instruction. See [`../AGENTS.md`](../AGENTS.md) and [`../RULES.md`](../RULES.md).

---

## Descoped: legal & consent {#descoped-legal--consent}

**This is out of scope by decision, and the residual risk is real.**

- PR #2 (`cc85267`) **removed** `90-legal-compliance.md` and the legal/compliance audit. The [decision record](../docs/04-decision-record.md) and [remediation plan](../docs/05-remediation-plan.md) both flag the legal items (recording consent, governing legal document, sub-processor DPAs, the interview-assistance responsible-use contradiction) as **hard launch blockers tracked separately and not resolved**.
- **Residual risk:** any production audio capture — especially the *other party's* audio — carries jurisdictional recording-consent and GDPR exposure. This is exactly why [loopback capture is stubbed](#capture--audio) rather than implemented. Microphone-only is the shipped path.
- **Rule:** do not re-introduce legal docs or a consent/disclosed-mode implementation as a side effect of other work. If a task would capture a third party's audio, **stop and escalate to the user**. Document the descope + residual risk; don't silently build around it.

## See also

- [`04-plan-mapping.md`](04-plan-mapping.md) — how these gaps trace back to the plan, decision record, and remediation plan.
- [`03-build-journal.md`](03-build-journal.md) — which phase introduced each piece.
- [`05-setup-and-run.md`](05-setup-and-run.md) — the env toggles that gate these features on/off.
</content>
