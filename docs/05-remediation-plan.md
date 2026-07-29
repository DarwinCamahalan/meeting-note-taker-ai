# Remediation Plan — Non-Legal Audit Findings

> Status: Accepted (binding) · Owner: Principal Architect (Platform) · Last updated: 2026-07-29 · Related: [Consolidated audit summary](audits/00-audit-summary.md) · [Reconciliation decision record](04-decision-record.md) · [System architecture](02-system-architecture.md) · [Desktop app](10-desktop-app.md) · [Engineering standards](13-engineering-standards.md) · [AI pipeline](21-ai-pipeline.md) · [Data model](30-data-model.md) · [Authentication](40-authentication.md) · [DevOps & infrastructure](60-devops-infrastructure.md) · [Observability](61-observability.md) · [Scalability](70-scalability.md) · [Unit economics](71-unit-economics.md)

This plan closes the **non-legal** findings from the [consolidated audit summary](audits/00-audit-summary.md) that the [decision record](04-decision-record.md) did **not** already resolve. The decision record settled the nine *contract-level* contradictions (A01–A09, SR-09, F-01, F-07); this plan takes the remaining engineering and financial hardening items and maps each to **exactly one owning doc** and a **concrete set of edits**, so appliers can execute without re-litigating the recommendation.

**Out of scope for this pass (intentional).** Legal, compliance, and recording-consent work — the audit's gating roadmap items #1–#4 (L1–L16, consent-record integrity, DPAs/sub-processor register, the interview-assistance responsible-use contradiction) — are **not** addressed here. They are hard launch blockers tracked separately in the [audit summary](audits/00-audit-summary.md#prioritized-remediation-roadmap); this document neither resolves nor contradicts them and adds no consent/disclosed-mode/DPA content.

Each workstream carries an **Edits (target → change)** block precise enough to apply against the current text. Where an edit resolves an existing *Open questions & risks* item, that item is restated as closed or residual.

---

## 1. Canonical remediation decisions (recap)

Five decisions govern this pass. Each closes specific audit findings and is binding on the owning doc(s) named.

| ID | Decision (one line) | Closes | Owning doc(s) |
|----|---------------------|--------|---------------|
| **RM-LAT** | Two published latency budgets — **server-controllable e2e p95 < ~900 ms** (endpointing → first cue token leaving `ws-gateway` egress) and **full user-perceived e2e p95 < 1.2 s** (incl. client render; client↔region network measured separately and **excluded** from the SLO). Explicit start point (endpointing) + a trace split at `ws-gateway` ingress/egress; cold-cache cues folded into the reported p95; an e2e latency **release gate** on representative hardware wired into CI. | SR-03, SR-11, SR-14, A07 | 02 + 21 (model); 61 + 13 (SLO/SLI + gate) |
| **RM-CAP** | Capacity re-derived **per region** (us-east-1, eu-west-1) from each region's own business-hours peak; Redis ops/sec modelled per scenario with the **token-bucket/counters Redis split from the stream/session Redis**; **genuinely regional** Anthropic/STT admission control; **99.9% SLO reconciled with DR** (quantify failover + RTO/RPO, then lower the SLO or fund an in-region hot standby); **pgvector filtered-HNSW recall + latency validated** with an `org_id` pre-filter, a recall assertion in the load suite, and per-tenant partial/partitioned indexes planned before Growth. | SR-01, SR-02, SR-04, SR-05, SR-06, SR-07 | 70 |
| **RM-ENC** | Per-org **envelope encryption is a launch requirement** — per-org DEK wrapped by a KMS CMK, encrypting transcript segments, summaries/notes, and document-chunk content at the envelope layer (in addition to volume KMS); **logical backups independently encrypted**; **Redis reclassified as sensitive-data-bearing**; JWTs signed with **KMS asymmetric keys** (not a raw Secrets Manager secret); ElastiCache **encryption in transit + at rest + AUTH** and **internal TLS** (Service Connect); the WS auth ticket **moved off the query string** to a subprotocol / first-message frame. | S-02, S-05, S-06, S-07 | 30 (envelope + backups + Redis class); 40 (KMS JWT + ElastiCache/TLS); 10 (WS ticket) |
| **RM-SC** | A **software supply-chain program stands up before `electron-updater` `autoDownload` is enabled** — frozen lockfile, advisory scanning as a merge gate, a CycloneDX SBOM per release, SLSA-style build provenance, secret scanning (gitleaks/trufflehog) as a gate, hash-pinned/verified native addons — plus **independent update-manifest signing** (minisign/TUF, key distinct from R2/S3 credentials), pinned+tested Windows `publisherName`/`verifyUpdateCodeSignature`, macOS notarization stapling verification, and tamper-rejection CI tests. | S-01, S-04 | 60 (program); 10 (manifest signing + client verify); 13 (CI merge gates) |
| **RM-FIN** | Financial model rebuilt against the **paid usage distribution segmented by persona** (job seeker heavy/bursty; sales steady-high; support high; accessibility moderate) with the heavy tail stressed at the canonical **$0.13/min overage**; churn/LTV **split by persona** (interview-prep transactional ~15–25%/mo; sales/support SaaS-like ~3–5%/mo) replacing the flat 5%; free-tier economics on a **cohort** basis; a **bottom-up opex** (team, infra, STT/LLM COGS, tooling, S&M/CAC) and a **true cash break-even including CAC**; margin **restated conventionally**; STT single-mixed-stream basis made explicit with a 2× downside. Keeps **$0.13/min overage** and **post-intro $3/$15 Sonnet** base (per decision record F-01/F-07). Every external number labelled an assumption/estimate. | F-02, F-03, F-04, F-05, F-06, F-08, F-10 | 71 |

---

## 2. Summary — audit IDs → owning doc → change

| Audit IDs | Topic | Owning doc | Change summary |
|-----------|-------|------------|----------------|
| SR-03, SR-11, SR-14 | Latency SLO validity (two-budget model, start point, client/server split) | `02-system-architecture.md` + `21-ai-pipeline.md` | Stop treating the summed per-hop table as a valid e2e p95; publish server-controllable (<900 ms) and full user-perceived (<1.2 s) budgets; fix the start point at endpointing; mark the `ws-gateway` ingress/egress trace split; fold cold-cache cues into the reported p95. |
| A07, SR-03 | e2e latency release gate + SLO/SLI + error budget | `61-observability.md` + `13-engineering-standards.md` | Split the cue-latency SLO into a server-controllable SLO (SLI'd) and a reported user-perceived figure; add `cue_server_latency_ms`; define the trace split point; add a staging **utterance→painted-token** release gate on representative hardware to the load-test CI gate. |
| SR-01, SR-02, SR-04, SR-05, SR-06, SR-07 | Per-region capacity, Redis ops/split, regional admission control, SLO/DR reconciliation, pgvector filtered recall | `70-scalability.md` | Re-derive capacity per region; model Redis ops/sec and split token-bucket Redis from stream/session Redis; make Anthropic/STT admission regional; quantify failover + RTO/RPO and reconcile with 99.9%; validate filtered-HNSW recall+latency and add a recall assertion + partitioned-index plan. |
| S-02 | Per-org envelope encryption + encrypted logical backups + Redis reclassified sensitive | `30-data-model.md` | Promote per-org DEK/KMS envelope encryption of transcript/summary/chunk content to a launch requirement; independently encrypt `pg_dump` logical backups; reclassify Redis as sensitive-data-bearing (drives 40's ElastiCache controls). |
| S-05, S-06 | KMS asymmetric JWT signing + ElastiCache encryption/AUTH + internal TLS | `40-authentication.md` | Sign access JWTs with a KMS asymmetric CMK (`kms:Sign`), not a raw Secrets Manager key; require ElastiCache in-transit + at-rest encryption + AUTH and internal Service-Connect TLS. |
| S-07 | WS auth ticket off the query string | `10-desktop-app.md` | Send the short-lived WS ticket via a `Sec-WebSocket-Protocol` subprotocol or a first-message auth frame, never the connection URL query string. |
| S-01 | Software supply-chain program gating auto-download | `60-devops-infrastructure.md` | Add the supply-chain program (frozen lockfile, advisory scan gate, CycloneDX SBOM per release, SLSA provenance, secret scanning gate, hash-pinned native addons); gate `autoDownload` on it; add SBOM + provenance + independent manifest-signing steps to the release pipeline. |
| S-04 | Auto-update hardening (manifest signing, publisher verify, stapling, tamper tests) | `10-desktop-app.md` | Verify an independent manifest signature (minisign/TUF) before sha512/code-sig; pin+test Windows `publisherName`/`verifyUpdateCodeSignature` and macOS stapling; add tamper-rejection CI tests; gate `autoDownload` on RM-SC. |
| S-01, S-04 | Supply-chain + tamper CI merge gates | `13-engineering-standards.md` | Add advisory-scan, SBOM, secret-scan, provenance, and update-tamper-rejection gates to the CI table, cross-referencing the program in `60`. |
| F-02, F-03, F-04, F-05, F-06, F-08, F-10 | Full financial rebuild | `71-unit-economics.md` | Persona-segmented paid-usage margin with the heavy tail stressed at $0.13/min; persona-split churn/LTV; cohort free-tier; bottom-up opex + true cash break-even incl. CAC; conventional margin restatement; explicit single-mixed-stream STT basis with a 2× downside. |

---

## 3. RM-LAT — Two-budget latency model + release gate (SR-03, SR-11, SR-14, A07)

**Problem (audit).** The `<1.2s p95` is derived by summing per-stage p95s (not a valid e2e p95), the clock starts inconsistently, client network for non-US/EU users is silently excluded, cold-cache cues are reported separately, and no owned test exercises utterance→painted-token on real hardware.

**Decision.** Publish **two** budgets and stop presenting the decomposition table as the SLO:

- **(a) Server-controllable e2e p95 < ~900 ms** — measured from **end-of-utterance endpointing** (Deepgram `speech_final`) to the **first cue token leaving `ws-gateway` egress**. This is the SLO'd number the team owns.
- **(b) Full user-perceived e2e p95 < 1.2 s** — adds client downlink + overlay render. The **client↔region network** portion is measured and reported **separately and excluded from the SLO** (it is not server-controllable).
- **Start point:** endpointing. **Trace split:** `ws-gateway` **ingress** (audio in) and **egress** (cue out) tag every span as client-network vs server-controllable.
- **Cold-cache cues are folded into the reported p95** — the first-cue-of-session cache-miss path is part of the distribution, not a footnote.

### Edits — `02-system-architecture.md` (owns the model)

| Target | Change |
|---|---|
| §1 principle 1 (L11) | Replace the single "< 1.2s p95" statement with the two budgets: server-controllable e2e p95 < ~900 ms (endpointing → cue leaving `ws-gateway` egress) is the SLO; full user-perceived e2e p95 < 1.2 s includes client render, with client↔region network reported separately and excluded from the SLO. |
| §4 intro (L145–147) | State the measurement start point = end-of-utterance endpointing (`speech_final`); name the `ws-gateway` ingress/egress trace split as the client-vs-server attribution boundary. |
| §4.1 table + note (L182–197) | Retitle the table "per-hop **decomposition** (diagnostic, **not** an additive SLO)"; add a note that percentiles do not sum. Group the rows: **client-network** (audio uplink L186, cue downlink L194) = measured, excluded from the SLO; **server-controllable** (internal forward L187 → Claude TTFT L192 → cue return internal L193 → egress) = the < 900 ms budget. Replace the single "End-to-end p95 < 1.2 s" row with two rows: server-controllable < 900 ms and full user-perceived < 1.2 s, both **inclusive of cold-cache cues**. Keep the A01 gRPC hops unchanged. |

### Edits — `21-ai-pipeline.md` (owns the budget detail)

| Target | Change |
|---|---|
| §4 intro (L94–96) | Keep the start point (`speech_final`) and add that the two totals below are **illustrative sums, not the SLO**; the SLO is measured on the observed end-to-end distribution including cold-cache cues. |
| §4 budget table (L98–110) | Annotate hops 1–2 (VAD, WS uplink) and hop 9 (WS downlink + paint) as **client-network — measured, excluded from the SLO**; hops 3–8 (endpointing → cue leaving `ws-gateway` egress) as **server-controllable < 900 ms**. Replace the two "Total" rows with: **server-controllable subtotal (p95 < 900 ms)** and **full user-perceived (p95 < 1.2 s)**, each reported over warm **and** cold cues (do not present the cold row as separate/optional). |
| §12 / Open-Q | Note that the client-side budget split is now owned via the `ws-gateway` ingress/egress trace tag; no client network is inside the SLO. |

### Edits — `61-observability.md` (owns SLO/SLI + error budget)

| Target | Change |
|---|---|
| §4.2 catalog (after L110) | Add `cue_server_latency_ms` (histogram; labels region, model, tier; **p95 < 900**) measured endpointing → `ws-gateway` egress; keep `cue_latency_ms` (full user-perceived, p95 < 1200) as a **reported** metric with the client-network portion broken out. |
| §6 decomposition table (L160–168) | Split the "End-to-end" row into **server-controllable subtotal (< 900 ms, SLO'd)** and **full user-perceived (< 1200 ms, reported)**; add the `ws.frame.recv` (ingress) / cue-egress split as the client/server boundary; state cold cues are included. |
| §9 SLO table (L207) | Replace the single Cue-latency SLO with two: **Cue latency (server-controllable)** — `% cues with cue_server_latency_ms < 900` — objective 95% (this is the error-budgeted SLO; ~5% budget); and **Cue latency (user-perceived)** — `% cues with cue_latency_ms < 1200` — **reported, not error-budgeted**, with the client-network tail attributed via the trace split. |
| Open-Q #3 (L250) | Restate as **resolved**: the split point exists at `ws-gateway` ingress/egress; server-controllable latency is SLO'd, user-network latency is reported only. |

### Edits — `13-engineering-standards.md` (owns the CI release gate)

| Target | Change |
|---|---|
| §4.4 load-test gates (L294) | Replace the single "< 1.2s p95" gate with **both** budgets: the staging load run must hold **server-controllable cue latency p95 < 900 ms** and **full user-perceived p95 < 1.2 s**, and must exercise **utterance → painted-overlay-token on representative hardware** (A07), not per-layer only. |
| §5.2 CI gate table (L367 row) | Rename the "Load / full E2E" row to include the **e2e latency release gate** and note it runs the utterance→painted-token harness on representative staging hardware and blocks release on either budget breach. Cross-link [Scalability §8](70-scalability.md) and [Observability §6/§9](61-observability.md). |

---

## 4. RM-CAP — Per-region capacity, Redis, regional admission, SLO/DR, pgvector recall (SR-01/02/04/05/06/07)

Owning doc: **`70-scalability.md`** (all edits below land here; cross-refs to `60`/`61` are pointers, not edits).

**4.1 Per-region capacity (SR-02).** §3 derives one smoothed global peak (~4,500 concurrent from 100k MAU / 10,080 min-week). Re-derive **per region**:

| Target | Change |
|---|---|
| §3.1 assumptions (A5, L132) | Replace "US + EU only" with an explicit **US/EU MAU split** assumption (e.g. `[A5a] US ≈ 65% / EU ≈ 35%` — labelled estimate) and apply the peak-to-average factor `[A4]=6×` to **each region's own local business-hours curve**, not a global average. |
| §3.2 derivation (L139–147) | Compute avg + peak concurrency **per region** from that region's MAU share and local curve; drop the single global peak as the sizing input. |
| §3.3–3.5 (ws-gateway / STT / Claude) | Size **each region's** `ws-gateway` fleet, STT lease pool, and Claude RPM/TPM to **its own** peak + headroom; show the two regional numbers, not one blended figure. |
| §3.6 scenario table (L179–183) | Add a US/EU column split per scenario (Launch/Growth/Scale) so procurement targets a regional ceiling. |

**4.2 Redis ops model + split (SR-01, SR-07).** A01 already removed raw audio from Redis; SR-01/SR-07 still need the ops model and the instance split.

| Target | Change |
|---|---|
| §2.5 / new §3.x | Add a **Redis ops/sec model per scenario** for the surviving control-state load: token-bucket draws (~cues/min), WS offset writes, entitlement-cache reads, presence heartbeats, idempotency, BullMQ. Show it is orders of magnitude below the old ~225k audio ops/sec now that audio is on gRPC (A01). |
| §2.5 + §4 mermaid | **Split Redis into two logical roles/instances:** (i) `redis-control` — Claude/STT token-bucket + counters + rate limits; (ii) `redis-session` — session state, WS resume offsets, presence, BullMQ. A failure or hot-key on one must not stall the other; size and fail over independently. |
| §8 load suite | Add **Redis throughput + failover** as an explicit pass/fail row (failover stall budget vs the live-path degradation ladder); reference the two-instance split. |
| Open-Q #3 (L334) | Restate: Redis is off the audio path (A01) and split control/session; residual is validating failover stall against the degradation ladder under chaos. |

**4.3 Regional admission control (SR-05).** §2.3 token bucket is account-level but lives in per-region Redis, so two stacks can jointly exceed one Anthropic quota.

| Target | Change |
|---|---|
| §2.3 Claude admission | Make admission **genuinely regional**: either **separate Anthropic orgs/keys per region** (each region's token bucket governs its own quota) **or** a **real global cross-region token bucket** (single source of truth for a shared account quota). State which and why. Apply the same to STT concurrency ceilings. |
| §5 provider regionality (L217) | Note per-region provider keys/quota as the mechanism; remove the implication that a per-region Redis bucket alone protects a shared account quota. |
| §8 (429-storm row, L319) | Extend the Claude 429/529 storm test to the **two-region** case (both stacks drawing on shared/again-split quota). |

**4.4 Availability vs DR (SR-04).** §4 pairs a 99.9% SLO with region-loss → snapshot-restore RTO and no failover.

| Target | Change |
|---|---|
| §4 failover posture (L216) + new subsection | **Quantify** Aurora failover, Redis failover, and DR **RTO/RPO** against the 99.9% error budget (~40 min/28 d), reconciling with [DevOps §9.2](60-devops-infrastructure.md) (region-loss RTO ≤ 60 min). Then take an explicit position: **either** publish a lower SLO that single-region-with-AZ-HA actually delivers for the live control plane, **or** fund an **in-region hot standby** for the live control plane. State the decision; do not leave both. |
| Open-Q #4 (L335) | Restate as the reconciled decision (SLO figure or hot-standby funding), not an open "whether that is acceptable." |
| Cross-ref | Note [Observability §9](61-observability.md) must carry whichever SLO number is chosen. |

**4.5 pgvector filtered recall (SR-06).** §2.4 asserts sub-10 ms and "filter first" for a single shared HNSW index.

| Target | Change |
|---|---|
| §2.4 (L88–96) | State that a shared HNSW index with an **`org_id` pre-filter** cannot truly filter-before-ANN; commit to **validating filtered-HNSW recall AND latency** under a realistic **multi-tenant** corpus (many orgs, skewed sizes), with the `org_id` boundary applied ([Data model §5](30-data-model.md) uses `org_id`; reconcile the `user_id` phrasing in [AI pipeline §7.2](21-ai-pipeline.md)). |
| §8 pgvector row (L320) | Add a **recall assertion** (e.g. recall@k vs an exact-search ground truth) to the pass criterion, not latency alone. |
| §2.4 / Open-Q #6 | Commit to **per-tenant partial or partitioned indexes before Growth** if the shared-index recall/latency degrades; align with [Data model Open-Q](30-data-model.md#open-questions--risks). |

---

## 5. RM-ENC — Envelope encryption + internal crypto (S-02, S-05, S-06, S-07)

**5.1 Per-org envelope encryption + backups + Redis class — `30-data-model.md` (S-02).**

| Target | Change |
|---|---|
| §9.1 matrix note (L604) | Replace "Application-level envelope encryption … is a documented enhancement" with a **launch requirement**: a **per-org data key (DEK)** wrapped by an **AWS KMS CMK**; `transcript_segments.content`, `transcripts.summary`/notes, and `document_chunks.content` are **envelope-encrypted at the application layer in addition to volume-level KMS**. Note the DEK is cached in-region and rotated with the CMK. |
| §3.3 / §3.4 | Mark the encrypted-at-envelope columns in the DDL commentary (content/summary/chunk-content) so the schema signals the requirement; keep embeddings queryable (envelope-encrypt the *content*, not the vector used for ANN — state this trade-off). |
| §6 Redis map intro (L510) | **Reclassify Redis as sensitive-data-bearing:** the interim transcript buffer and session state carry transcript-derived content, so Redis requires encryption in transit + at rest + AUTH (provisioned per [Auth §6](40-authentication.md)/[DevOps §2.3](60-devops-infrastructure.md)). Keep the "not authoritative" property but drop the implication that it holds no sensitive data. |
| §9.1 backups | State that **logical backups (`pg_dump`) are independently encrypted** with a key distinct from the volume/SSE key (cross-ref [DevOps §9.1](60-devops-infrastructure.md) nightly `pg_dump`). |
| Open-Q (L668) | Restate as **resolved**: envelope encryption of transcript content is a launch requirement; residual is the latency/searchability tuning of the DEK path. |

**5.2 KMS JWT signing + ElastiCache/internal TLS — `40-authentication.md` (S-05, S-06).**

| Target | Change |
|---|---|
| §2 token table (L68) | Replace "EdDSA/ECDSA private key in AWS Secrets Manager" with **KMS asymmetric signing**: an AWS KMS CMK (`ECC_NIST_P256`, `SIGN_VERIFY`) signs the `ES256` access JWT via `kms:Sign`; the private key **never leaves KMS**; JWKS at `/.well-known/jwks.json` is published from the KMS public key. |
| ADR-40.2 (L98–103) | Add that signing is KMS-backed (no raw signing secret on a host); note the added `kms:Sign` latency is off the hot path (only `api` signs; edge services verify with the cached public JWKS). |
| §6 hardening table (L339 "JWT algorithm confusion" row) + new row | Key rotation is **KMS key rotation** (not Secrets Manager). Add a row: **Cache/inter-service confidentiality** → ElastiCache **in-transit TLS + at-rest encryption + AUTH token**, and **internal TLS via ECS Service Connect** for service-to-service traffic (Redis now sensitive per [Data model §6](30-data-model.md)). |
| Cross-ref | Flag for the `60` applier: [DevOps §8 secrets table](60-devops-infrastructure.md) lists "JWT signing keys" under Secrets Manager — reconcile to "KMS CMK (asymmetric)" and add ElastiCache AUTH token + in-VPC TLS to §2.3 when the supply-chain edits land. |

**5.3 WS ticket off the query string — `10-desktop-app.md` (S-07).**

| Target | Change |
|---|---|
| §3.1 / §7 (ws-gateway client) | Specify that the short-lived signed WS ticket (minted by `api`, per [System architecture §5.1](02-system-architecture.md)) is presented via a **`Sec-WebSocket-Protocol` subprotocol value** or a **first-message auth frame**, **never** in the connection URL query string (query strings leak into access logs, proxies, and history). The socket stays unauthenticated until the first frame validates, then upgrades. |
| §8 area / security note | Note the desktop `ws-gateway` client never logs or persists the ticket; cross-ref [Backend services](20-backend-services.md) for the server-side handshake acceptance. |

---

## 6. RM-SC — Supply-chain program + auto-update hardening (S-01, S-04)

**6.1 Supply-chain program gating auto-download — `60-devops-infrastructure.md` (S-01).**

| Target | Change |
|---|---|
| New §"Software supply-chain & build provenance" (before §7) | Add the program: **`pnpm --frozen-lockfile`** in every CI install; **dependency-advisory scanning as a merge gate** (fail on high/critical); a **CycloneDX SBOM generated per release** and stored with the artifact; **SLSA-style build provenance** (GitHub OIDC attestations binding artifact → source commit → builder); **secret scanning (gitleaks/trufflehog) as a merge gate**; **hash-pinned + integrity-verified native addons** (audio/window N-API modules). |
| §7 release pipeline (L304–393) | Add SBOM + provenance emission steps to the desktop release job; add an **independent manifest-signing** step (minisign or a TUF-style feed) with a key **distinct from R2/S3 credentials**, published alongside `latest*.yml`. |
| §7.5 provenance (L384) | Extend: the sha512 in the manifest is not sufficient because the manifest shares R2's origin; the **manifest itself is independently signed** and clients verify that signature (see [Desktop app §8](10-desktop-app.md)). |
| ADR + Principle 5 (L15) | State that **`autoDownload` must not be enabled until this program is live**; a poisoned dependency in a code-signed auto-pushed build is otherwise a trusted push. |
| Open-Q #4 (L456) | Add SBOM/provenance/manifest-signing to the four-control-plane audit surface note. |

**6.2 Auto-update integrity — `10-desktop-app.md` (S-04).**

| Target | Change |
|---|---|
| §8 updater code (L517–532) | Gate `autoUpdater.autoDownload = true` on RM-SC; add **independent manifest-signature verification** (minisign/TUF public key **pinned in the client binary**, key distinct from R2/S3) **before** the existing sha512 + OS code-signature checks. |
| §8 integrity bullet (L534) | Require, on Windows, explicit `publisherName` + `verifyUpdateCodeSignature` configuration (do not rely on defaults); on macOS, verify **notarization stapling** client-side. Reject on any mismatch. |
| §10 testing table + new gate | Add **tamper-rejection CI tests**: a tampered `latest*.yml` (bad signature), a swapped installer (bad sha512), and an unsigned/mis-signed binary must each be **rejected** by the updater — a release blocker if any is accepted. |
| Open-Q #5 (L587) | Restate to include re-running the manifest-signature + tamper-rejection suite on every Electron bump alongside the content-protection matrix. |

**6.3 CI merge gates — `13-engineering-standards.md` (S-01, S-04).**

| Target | Change |
|---|---|
| §5.2 CI gate table (L366 "Security" row) | Expand the Security row into explicit **blocking gates**: frozen-lockfile check, advisory scan (high/critical fail), gitleaks/trufflehog secret scan, CycloneDX SBOM generation, SLSA provenance attestation, and — for desktop releases — the **update tamper-rejection** suite. Cross-link the program in [DevOps](60-devops-infrastructure.md). |
| §5 note | Note that these are the merge-gate half of the program whose provisioning/keys live in `60`. |

---

## 7. RM-FIN — Financial rebuild — `71-unit-economics.md` (F-02, F-03, F-04, F-05, F-06, F-08, F-10)

Keeps the canonical **$0.13/min overage** (F-01) and **post-intro $3/$15 Sonnet** base (F-07); rebuilds everything the audit flagged as resting on a whole-base average.

| Target | Change |
|---|---|
| §4 gross margin (L102–148) | Replace the single whole-base "avg 300 min" model with **persona-segmented paid usage**: job seeker (heavy/bursty, near the cap), sales (steady-high), support (high), accessibility (moderate). Model gross margin against the **paid usage distribution by persona**, and **stress the heavy tail at $0.13/min overage** (show the tail becoming *more* profitable, not less). Note that the personas who pay $20 are the heavy users the sensitivity grid (§8) shows going margin-negative near the cap absent overage. |
| §7 LTV/CAC (L198–209) | Replace the flat **5%/mo churn** with **persona-split churn**: interview-prep transactional **~15–25%/mo**; sales/support SaaS-like **~3–5%/mo**. Recompute LTV per persona and a blended LTV weighted by the paid mix; carry the higher transactional churn into payback. |
| §5 free tier (L152–168) | Rebuild free-tier economics on a **cohort basis** (conversion + retention curves over time), not a single `5% × $0.40` steady-state; show the loss-leader cost as a cohort that amortizes as conversion matures. |
| §6 break-even (L172–194) | Replace the placeholder **$120k/mo** opex with a **bottom-up build**: team, infra, **STT/LLM COGS**, tooling, **and S&M/CAC**. Present a **true cash break-even including CAC** (not only the COGS-contribution figure). |
| §6.1 blended (L174–183) | **Restate margin conventionally**: gross margin = revenue − COGS (STT + LLM + infra) only; move the free-base "drag" out of gross margin and present it as an S&M/CAC-like line, so the headline margin is comparable to standard SaaS reporting. |
| §2.2 / §3.3 STT basis (F-08/F-10) | Make the **single mixed-mono STT stream (~1× wall-clock)** assumption **explicit** and tie it to the diarization approach; re-run COGS with **2× STT** (two-channel diarization) as a labelled downside; note the committed-STT contract should be locked early. |
| §11 Open-Q | Restate #3 (usage), #5 (churn/conversion), #6 (opex) as **addressed** by the persona/cohort/bottom-up rebuild; keep them as residual validation-against-telemetry items. Confirm every external figure is labelled an assumption/estimate. |

---

## 8. Ownership partition (each doc, exactly one applier)

| Doc | Workstream(s) this applier owns |
|---|---|
| `02-system-architecture.md` + `21-ai-pipeline.md` | RM-LAT model (two budgets, start point, trace split; keep A01 gRPC hops) |
| `61-observability.md` + `13-engineering-standards.md` | RM-LAT SLO/SLI + error budget + e2e release gate; RM-SC CI merge gates (in `13`) |
| `70-scalability.md` | RM-CAP (per-region capacity, Redis ops/split, regional admission, SLO/DR, pgvector recall) |
| `30-data-model.md` | RM-ENC envelope encryption + encrypted logical backups + Redis reclassified sensitive |
| `40-authentication.md` | RM-ENC KMS asymmetric JWT signing + ElastiCache encryption/AUTH + internal TLS |
| `10-desktop-app.md` | RM-ENC WS ticket off query string; RM-SC manifest signing + publisher/stapling verify + tamper tests |
| `60-devops-infrastructure.md` | RM-SC supply-chain program gating `autoDownload` (+ reconcile §8 JWT-key/ElastiCache cross-refs) |
| `71-unit-economics.md` | RM-FIN full financial rebuild |

Cross-references between docs are **pointers, not edits**: the flagged reconciliations (60 §8 secrets row; 21 §7.2 `user_id`↔`org_id`; the chosen SLO number appearing in 61) are applied by the owning doc's applier, not duplicated.

---

## Open questions & risks

- **RM-LAT — the split point must exist before the SLO is committed.** The server-controllable < 900 ms SLO is only measurable once the `ws-gateway` ingress/egress trace tag ships and client-network spans are attributed; until then the number is provisional. The representative-hardware release gate also needs an agreed hardware baseline (which laptops/OS) or it silently drifts.
- **RM-CAP — the US/EU MAU split and per-region peaks are estimates.** Regional sizing is only as good as the split assumption; a wrong split over-provisions one region and starves the other. The SLO-vs-DR decision (lower the SLO or fund a hot standby) has a real cost consequence that must be owned with [DevOps](60-devops-infrastructure.md) and the [Roadmap](80-roadmap.md).
- **RM-CAP — pgvector recall under a real multi-tenant corpus is unproven.** The recall assertion needs a ground-truth exact-search comparison and a corpus shaped like production (skewed org sizes); a poor result forces the per-tenant partitioned-index work earlier than Growth.
- **RM-ENC — envelope encryption vs latency/searchability.** Per-org DEK decryption on the hot path adds work to context assembly; the DEK-cache strategy must stay within the [AI pipeline §4](21-ai-pipeline.md) budget, and full-text search over encrypted transcript content is constrained (content is envelope-encrypted; the ANN vector is not). Confirm the trade-off is acceptable to product.
- **RM-ENC — KMS `kms:Sign` availability.** JWT minting now depends on KMS; a KMS regional blip degrades new-token issuance (existing tokens still verify from cached JWKS). Bound this against the auth availability SLO.
- **RM-SC — `autoDownload` is blocked until the program is live.** This is a real sequencing constraint: auto-update GA cannot precede the supply-chain gates and independent manifest signing. The minisign/TUF key custody (distinct from R2/S3) needs an owner and a rotation runbook.
- **RM-FIN — persona mix and churn are the dominant unknowns.** The rebuild is only as sound as the paid-persona mix and the transactional-churn estimates; interview-prep at ~15–25%/mo churn can invert LTV/CAC. Every figure stays a labelled assumption pending Stripe + telemetry cohorts, and the willingness-to-pay validation of $0.13/min (decision record F-01) remains gating before Pro GA.
- **Scope boundary.** This plan covers only the non-legal findings. The audit's gating items #1–#4 (recording consent, the governing legal document, sub-processor DPAs, the interview-assistance responsible-use contradiction) and the medium "stage-inappropriate breadth" item (A06 — partially addressed by decision record A02) are **not** resolved here and remain tracked in the [audit summary](audits/00-audit-summary.md#prioritized-remediation-roadmap).
