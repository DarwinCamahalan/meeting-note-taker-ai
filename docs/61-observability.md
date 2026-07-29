# Observability & Operations

> Status: Draft · Owner: Principal Architect (Reliability & Operations) · Last updated: 2026-07-29 · Related: [System architecture](02-system-architecture.md) · [DevOps & infrastructure](60-devops-infrastructure.md) · [Backend services](20-backend-services.md) · [AI pipeline](21-ai-pipeline.md) · [Desktop app](10-desktop-app.md) · [Scalability](70-scalability.md) · [Data model](30-data-model.md)

This doc owns how we know **Cue** is healthy: the three pillars (logs, metrics, traces), product analytics + feature flags, crash reporting, the SLO/SLI/error-budget catalog tied to the [non-functional targets](02-system-architecture.md), alerting + on-call + runbooks, and the hard rule that telemetry never carries transcript content or PII. Infra provisioning of these tools lives in [DevOps](60-devops-infrastructure.md); this doc defines *what* we measure and *how we respond*.

---

## 1. Principles

1. **Latency is the SLO.** The product's reason to exist is a cue in the overlay in < 1.2s. Everything we instrument first answers "where did the 1.2s go?" (§6 latency decomposition).
2. **One correlation ID from tap to overlay.** A single `sessionId` + per-utterance `turnId` threads desktop → `ws-gateway` → `ai-orchestrator` → STT/LLM and back. You can reconstruct any single cue's full journey.
3. **Never log the content.** Transcripts, cue text, resume/JD/knowledge-base contents, audio, and PII are *never* in logs, metrics labels, traces, or analytics events. We log *shapes and durations*, not *substance* (§8).
4. **Signals drive budgets, budgets drive priority.** SLIs feed error budgets; a burned budget changes what the team is allowed to ship ([DevOps §environments](60-devops-infrastructure.md)).
5. **Every alert links a runbook.** An alert with no runbook is a bug. Pages are actionable; everything else is a ticket.

---

## 2. Stack at a glance

| Concern | Tool | Scope |
|---|---|---|
| Structured logging | **pino** → CloudWatch Logs (+ Loki for query) | all services + desktop main-process (redacted) |
| Metrics | **Prometheus** (scrape) + **Grafana** (dashboards) | services, infra, business metrics |
| Tracing | **OpenTelemetry** SDK → OTel Collector → Grafana Tempo | all services + the LLM/STT spans |
| Error tracking | **Sentry** | desktop (renderer + main), web, backend |
| Product analytics + flags | **PostHog** | web + desktop (consented, PII-safe) |
| Infra metrics | CloudWatch → Prometheus (via exporter) + Grafana | ECS/ALB/Aurora/Redis |
| Uptime / synthetics | Grafana Synthetic Monitoring + Route53 health checks | public endpoints |
| Alerting | **Grafana Alerting** + **PagerDuty** | routes by severity |

OpenTelemetry is the backbone: pino logs, Prometheus metrics (via the OTel metrics SDK / prom exporter), and Tempo traces all share the same `trace_id`/`sessionId`/`turnId` resource attributes, so a Grafana panel jumps log ↔ metric ↔ trace on one identifier.

---

## 3. Logging

### 3.1 Structured pino, one schema

Every service uses `pino` with a shared serializer from `packages/core` so log shape is identical across `api`, `ws-gateway`, `ai-orchestrator`, `entitlements`, `billing-webhooks`.

```jsonc
// canonical log line (info) — note: NO transcript/PII fields exist in the schema
{
  "level": 30,
  "time": 1753800000000,
  "service": "ai-orchestrator",
  "env": "prod",
  "region": "us-east-1",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",   // OTel trace id
  "sessionId": "sess_01H...",                          // meeting session
  "turnId": "turn_00042",                              // one utterance→cue cycle
  "userIdHash": "sha256:9f2c...",                      // salted hash, never raw id/email
  "event": "llm.stream.first_token",
  "model": "claude-haiku-4-5",
  "durationMs": 380,
  "tokensIn": 1240,        // counts only — never the tokens themselves
  "tokensOut": 0
}
```

### 3.2 Correlation across the realtime path

```mermaid
sequenceDiagram
  autonumber
  participant D as desktop (main)
  participant WS as ws-gateway
  participant AIO as ai-orchestrator
  participant STT as Deepgram
  participant LLM as Claude
  D->>WS: WS frame {sessionId, turnId, audioChunk}
  Note over D,WS: desktop generates sessionId on connect,<br/>turnId per detected utterance (VAD)
  WS->>AIO: forward {sessionId, turnId} + trace context (W3C traceparent)
  AIO->>STT: stream audio (span: stt.stream)
  STT-->>AIO: partial/final transcript
  AIO->>LLM: prompt (span: llm.generate, attr model)
  LLM-->>AIO: token stream
  AIO-->>WS: cue tokens {sessionId, turnId}
  WS-->>D: render cue
  Note over D,LLM: same trace_id + sessionId + turnId on every log/span/metric
```

- Desktop main-process injects `sessionId`; `ws-gateway` accepts it and mints/propagates the W3C `traceparent`. `turnId` is created at VAD utterance boundaries ([AI pipeline](21-ai-pipeline.md)).
- Renderer logs go to Sentry (breadcrumbs) + a rate-limited, redacted local ring buffer the user can attach to a support bundle — they do **not** stream raw to the backend.

### 3.3 Transport & retention

- Services log to stdout → CloudWatch Logs (via the Fargate awslogs driver) → shipped to **Loki** for fast label-based query in Grafana.
- Retention: `prod` 30 days hot in Loki, 90 days in CloudWatch (S3 archive after). `dev`/`staging` 7 days.
- Log levels: `info` default; `debug` behind a PostHog flag, time-boxed, never left on in prod.

---

## 4. Metrics

### 4.1 RED + USE

- **RED** (per service, request-oriented): **R**ate, **E**rrors, **D**uration — for `api`, `ws-gateway`, `ai-orchestrator`, `entitlements`, `billing-webhooks`.
- **USE** (per resource): **U**tilization, **S**aturation, **E**rrors — for CPU/mem (Fargate), Aurora ACU/connections, Redis memory/evictions, ALB queue depth.

### 4.2 Key metrics catalog

The starred rows are the ones on the top-line "is the product working" dashboard.

| Metric | Type | Labels | Target (SLO) | Why |
|---|---|---|---|---|
| ⭐ `cue_latency_ms` (audio→visible cue) | histogram | region, model, tier | **p50 < 600 · p95 < 1200 · p99 < 2000** | the product SLO |
| ⭐ `stt_partial_lag_ms` | histogram | provider (deepgram/assembly) | p95 < 300 | STT partials feed responsiveness |
| ⭐ `llm_ttft_ms` (time-to-first-token) | histogram | model | p95 < 500 | dominant contributor to cue latency |
| `llm_tokens_per_sec` | gauge | model | > 40 | streaming smoothness |
| ⭐ `ws_active_connections` | gauge | region, service | capacity signal | scaling + saturation |
| `ws_connection_duration_s` | histogram | — | — | drain/deploy behavior |
| ⭐ `api_request_duration_ms` | histogram | route, method, status | **p99 < 200** (excl. LLM) | backend NFR |
| `api_5xx_rate` | counter→ratio | route | < 0.1% | error SLO |
| ⭐ `minutes_consumed` | counter | userIdHash, tier | billing truth | metering + [entitlements](50-subscriptions-entitlements.md) |
| `stt_stream_errors` | counter | provider | — | triggers STT failover |
| `llm_stream_errors` | counter | model | — | model routing/fallback |
| `llm_cost_usd` (derived) | counter | model | budget | [unit economics](71-unit-economics.md) |
| `update_apply_success_ratio` | gauge | version, channel | > 99% | staged-rollout gate ([DevOps §7.6](60-devops-infrastructure.md)) |
| `crash_free_sessions` | gauge | os, version | > 99.5% | desktop release health |
| `entitlement_check_ms` | histogram | — | p99 < 20 | must not add latency to gating |
| `aurora_acu` / `redis_mem_pct` | gauge | region | headroom | USE saturation |

- `minutes_consumed` and `llm_cost_usd` are **business** metrics but live here because reliability and cost are inseparable on the AI path; they reconcile against Stripe metering ([Payments](51-payments-stripe.md)) and the [cost model](71-unit-economics.md).
- **Cardinality guard:** `userIdHash` is used only on counters aggregated server-side, never as a Prometheus label on high-frequency histograms (it would explode cardinality). Per-user rollups come from the events warehouse, not Prometheus.

### 4.3 Dashboards (Grafana)

1. **Product health (NOC):** the ⭐ rows — cue latency percentiles, STT lag, LLM TTFT, active WS, api p99, error budget burn.
2. **Per-service RED** (one row per service).
3. **AI cost & usage:** tokens, cost by model, minutes consumed, cache-hit ratio ([AI pipeline](21-ai-pipeline.md)).
4. **Infra USE:** Fargate, Aurora, Redis, ALB.
5. **Release health:** crash-free sessions, update apply ratio by version/channel.

---

## 5. Tracing

- **OpenTelemetry** SDK in every Node service (auto-instrumentation for HTTP, Postgres/Drizzle, Redis, ws) plus **manual spans** on the AI path.
- Spans on the critical path: `ws.frame.recv` → `vad.segment` → `stt.stream` → `context.assemble` (RAG retrieval + prompt build) → `llm.generate` (attrs: `model`, `tokens_in`, `tokens_out`, `cache_hit`, `ttft_ms`) → `cue.emit`. The **LLM and STT calls are explicit child spans** so a trace shows exactly how the 1.2s budget was spent.
- Exporter → **OTel Collector** (sidecar/daemon per cluster) → **Tempo**. Trace ↔ log ↔ metric correlation via shared `trace_id`.
- **Sampling:** tail-based — keep 100% of traces where `cue_latency_ms > 1200` or any error, plus a 5% baseline of healthy traces. This keeps slow/broken cues fully observable without paying to store every healthy one.

```mermaid
graph LR
  A[ws.frame.recv] --> B[vad.segment]
  B --> C[stt.stream<br/>Deepgram]
  C --> D[context.assemble<br/>RAG + prompt cache]
  D --> E[llm.generate<br/>Claude · ttft/tokens]
  E --> F[cue.emit → overlay]
```

---

## 6. Latency decomposition (the money view)

The single most important operational artifact: the cue-latency budget, broken into spans so a p95 regression points at the offending stage. Aligns with [AI pipeline §latency-budget](21-ai-pipeline.md).

| Stage | Budget (p95) | Span | Alert if p95 > |
|---|---|---|---|
| Desktop capture + encode + WS send | 120 ms | `ws.frame.recv` | 200 ms |
| VAD segmentation | 40 ms | `vad.segment` | 80 ms |
| STT (final partial for the turn) | 300 ms | `stt.stream` | 400 ms |
| Context assembly (RAG + prompt build, cached) | 120 ms | `context.assemble` | 250 ms |
| LLM time-to-first-token | 450 ms | `llm.generate` (ttft) | 600 ms |
| Emit + render in overlay | 100 ms | `cue.emit` | 200 ms |
| **End-to-end** | **< 1200 ms** | full trace | **1200 ms** |

A `cue_latency_ms` p95 breach auto-links the Grafana panel to the slowest-stage histogram so on-call sees *which* span blew the budget within seconds.

---

## 7. Product analytics, feature flags, crash reporting

### 7.1 PostHog (consented, PII-safe)

- Autocapture **off**. We emit an explicit, typed event allowlist from `packages/core` (e.g. `session_started`, `cue_shown`, `cue_dismissed`, `upload_added`, `trial_started`, `plan_upgraded`). Properties are enums/counts/durations — **never** cue text, transcript, or file contents.
- User identity in PostHog is the salted `userIdHash`, not email; EU users' analytics are region-pinned. Analytics respect the user's consent + [acceptable-use/consent model](01-product-vision.md#responsible-use) — a user in "no-telemetry" mode emits nothing beyond crash counts.
- **Feature flags** drive gradual rollout of features and the debug-log toggle; flags are read server-side in services and client-side in web/desktop with the same PostHog project.

### 7.2 Sentry (crash + error)

- **Desktop:** both processes. Renderer errors + main-process crashes (native crash reporter → Sentry). Source maps + symbol upload in the release pipeline ([DevOps §7](60-devops-infrastructure.md)) so stacks are symbolicated; release = the desktop semver tag, so `crash_free_sessions` is tracked per version and gates staged rollout.
- **Web + backend:** unhandled exceptions with `trace_id` linked so a Sentry issue jumps to the Tempo trace.
- **Scrubbing:** Sentry `beforeSend` strips request bodies, headers with tokens, and any field on the PII denylist (§8). Breadcrumbs are event-name only.

---

## 8. Privacy in telemetry (hard rules)

This is a privacy product; the observability stack is a top exfiltration risk if sloppy. Owned jointly with [security/compliance](01-product-vision.md#responsible-use) and [Data model §data-lifecycle](30-data-model.md).

- **Never captured, anywhere (logs/metrics/traces/analytics/Sentry):** audio bytes, transcript text (partial or final), cue/answer text, uploaded document contents, prompt or completion token *content*, raw email, raw user id, IP beyond coarse geo, payment data.
- **Allowed:** durations, counts, token *counts*, model names, status codes, salted `userIdHash`, `sessionId`/`turnId` (opaque), coarse region.
- **Enforcement is code, not policy:** a shared pino redaction config + a Sentry `beforeSend` scrubber + an OTel span processor that drops any attribute not on the allowlist, all in `packages/core`. A CI lint rule (custom ESLint) fails the build if a log/span/analytics call references a denylisted field name. Redaction is applied at the *source* SDK, before anything leaves the process.
- **Right to be forgotten:** telemetry keyed by `userIdHash` is purgeable; a deletion request ([Data model](30-data-model.md)) fans out to PostHog + Sentry + log stores.

---

## 9. SLOs, SLIs & error budgets

Tied directly to the [NFR targets](02-system-architecture.md). Windows are rolling 28-day.

| SLO | SLI (measurement) | Objective | Error budget (28d) |
|---|---|---|---|
| **Cue latency** | % of cues with `cue_latency_ms` < 1200 (excludes user-network-bound outliers) | 95% | 5% of cues |
| **Cue availability** | % of started sessions that stream ≥1 cue without server error | 99.9% | ~40 min |
| **API availability** | % `api` requests non-5xx | 99.9% | ~40 min |
| **API latency** | % `api` requests < 200 ms p99 (excl. LLM) | 99% | 1% |
| **STT freshness** | % turns with `stt_partial_lag_ms` < 300 | 95% | 5% |
| **Uptime (edge)** | synthetic + Route53 health check success | 99.9% | ~40 min |
| **Desktop stability** | `crash_free_sessions` | 99.5% | 0.5% of sessions |

**Error-budget policy:** when a rolling budget is >50% consumed, non-critical feature deploys pause and reliability work is prioritized; when exhausted, only fixes + rollbacks ship until the budget recovers. Budget burn is a first-class panel on the NOC dashboard and reviewed weekly. This links the reliability posture to the release gates in [DevOps §environments](60-devops-infrastructure.md).

---

## 10. Alerting, on-call & runbooks

### 10.1 Severity → routing

| Sev | Definition | Route | Ack SLA |
|---|---|---|---|
| **P1** | User-facing outage: cue availability < SLO, region down, auth broken, payment webhooks failing, desktop release un-installable | PagerDuty page (24/7) | 5 min |
| **P2** | Degradation: latency SLO burning fast, STT failover active, elevated 5xx, budget >50% | PagerDuty (business hours) + Slack | 30 min |
| **P3** | Warnings: saturation nearing threshold, single-AZ blip, slow budget burn | Slack ticket | next day |

- **Multi-window burn-rate alerts** (fast 1h + slow 6h windows) on the latency and availability SLOs — the standard Google SRE pattern — so we page on real budget threats, not on single noisy minutes.
- Alerts are defined as code (Grafana Alerting provisioned via Terraform, [DevOps §4](60-devops-infrastructure.md)); every alert rule embeds a `runbook_url` annotation.

### 10.2 Representative runbooks (live in `docs/runbooks/`, Phase 1)

- **RB-01 — Cue latency SLO burn.** Open the latency-decomposition dashboard → find the blown stage. If `llm.generate` ttft: check Anthropic status + model routing, consider shedding to `claude-haiku-4-5` for live cues. If `stt.stream`: check Deepgram health, confirm failover to AssemblyAI engaged. If `context.assemble`: check pgvector query time + prompt-cache hit ratio. Escalate to AI on-call if vendor-side.
- **RB-02 — ws-gateway saturation / connection storm.** Check `ws_active_connections` vs task count; confirm autoscaling firing; verify no reconnect storm (desktop backoff). Scale max tasks; if a bad deploy, roll back per [DevOps §6.2](60-devops-infrastructure.md) (drains, never kills live meetings).
- **RB-03 — Bad desktop release.** Crash-free < threshold or `update_apply_success_ratio` dropping: set `stagingPercentage` back / re-publish prior version as `latest` ([DevOps §7.6](60-devops-infrastructure.md)); triage Sentry issue for the release; hotfix + new tag.
- **RB-04 — Region failover.** Route53 flip us-east-1 → eu-west-1; restore/scale per DR runbook ([DevOps §9.2](60-devops-infrastructure.md)); verify RPO/RTO.
- **RB-05 — Stripe webhook failure.** `billing-webhooks` 5xx / DLQ growth: entitlements may be stale; replay from Stripe, reconcile via [entitlements](50-subscriptions-entitlements.md) / [payments](51-payments-stripe.md).

### 10.3 On-call

- Primary + secondary rotation, weekly, following-the-sun once EU staffed. Every P1/P2 gets a blameless postmortem within 3 business days with action items tracked. Synthetic checks run from both regions so we detect edge failures before users report them.

---

## Open questions & risks

1. **Cardinality vs granularity.** `sessionId`/`turnId` are invaluable for correlation but must stay out of Prometheus labels; the exact split between Prometheus (aggregate) and the events warehouse (per-session) needs load validation to avoid a metrics-cost blowout.
2. **Tail sampling tuning.** Keeping 100% of >1200ms + errors plus 5% baseline is a starting point; under a latency incident this can spike Tempo ingest. Need a collector-side rate cap that never drops error/slow traces first.
3. **Client-side latency attribution.** Part of `cue_latency_ms` is the user's own network (desktop→edge). We must separate server-controllable latency (SLO'd) from user-network latency (reported, not SLO'd) or the SLO becomes un-actionable — needs a clean split point in the trace at `ws.frame.recv`.
4. **Redaction completeness.** The denylist ESLint rule + SDK-level scrubbers are only as good as their field coverage; a new field name for transcript data could slip through. Mitigation: default-deny span/analytics attributes (allowlist), and a periodic telemetry-egress audit sampling real prod payloads in a secure enclave.
5. **PostHog EU residency.** EU analytics must not leave region; verify PostHog project region-pinning and that feature-flag evaluation doesn't round-trip PII cross-region.
6. **Cost of observability itself.** Loki + Tempo + Prometheus + PostHog + Sentry at scale is a real line item; needs its own budget alert and retention tuning so telemetry cost stays a small, known fraction of COGS ([Unit economics](71-unit-economics.md)).
