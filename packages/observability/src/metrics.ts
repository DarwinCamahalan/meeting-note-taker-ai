/**
 * Prometheus metrics registry + the canonical Cue SLI catalog (per
 * 61-observability §7 metric table & §9 SLO catalog).
 *
 * Design notes tied to the spec:
 *  - Two latency histograms sharing one start point (endpointing): the
 *    error-budgeted server slice `cue_server_latency_ms` (p95 < 900) and the
 *    reported-only full slice `cue_latency_ms` (p95 < 1200) — ADR-61.1.
 *  - Cardinality guard (§7 note): `userIdHash` is NEVER a Prometheus label;
 *    `minutes_consumed` carries only `tier`. Per-user rollups come from the
 *    events warehouse, not Prometheus.
 */
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
  type CounterConfiguration,
  type GaugeConfiguration,
  type HistogramConfiguration,
} from 'prom-client';

/** The Prometheus text exposition content-type served at `/metrics`. */
export const PROM_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

/** Latency buckets (ms) tuned for the sub-second cue path and API NFRs. */
export const LATENCY_MS_BUCKETS: readonly number[] = [
  5, 10, 25, 50, 75, 100, 150, 200, 300, 450, 600, 800, 900, 1000, 1200, 1500, 2000, 3000, 5000,
];

/** Duration buckets (s) for long-lived connections. */
export const DURATION_S_BUCKETS: readonly number[] = [1, 5, 15, 30, 60, 300, 900, 1800, 3600];

/** The canonical SLI instances a Cue service records. */
export interface CueSlis {
  /** ⭐ endpointing→ws-gateway egress; the error-budgeted SLO (p95 < 900ms). */
  readonly cueServerLatencyMs: Histogram<'region' | 'model' | 'tier'>;
  /** ⭐ endpointing→painted overlay token; reported-only (p95 < 1200ms). */
  readonly cueLatencyMs: Histogram<'region' | 'model' | 'tier'>;
  /** ⭐ STT partial lag (p95 < 300ms). */
  readonly sttPartialLagMs: Histogram<'provider'>;
  /** ⭐ LLM time-to-first-token (p95 < 500ms). */
  readonly llmTtftMs: Histogram<'model'>;
  /** LLM streaming smoothness (target > 40). */
  readonly llmTokensPerSec: Gauge<'model'>;
  /** ⭐ active WS connections — capacity/saturation signal. */
  readonly wsActiveConnections: Gauge<'region' | 'service'>;
  /** WS connection lifetime — drain/deploy behavior. */
  readonly wsConnectionDurationS: Histogram<string>;
  /** ⭐ API request duration excl. LLM (p99 < 200ms). */
  readonly apiRequestDurationMs: Histogram<'route' | 'method' | 'status'>;
  /** API 5xx counter (→ ratio < 0.1%). */
  readonly api5xxTotal: Counter<'route'>;
  /** ⭐ billing truth — minutes consumed (labelled by `tier` ONLY; no userIdHash). */
  readonly minutesConsumedTotal: Counter<'tier'>;
  /** STT stream errors — triggers failover. */
  readonly sttStreamErrorsTotal: Counter<'provider'>;
  /** LLM stream errors — model routing/fallback. */
  readonly llmStreamErrorsTotal: Counter<'model'>;
  /** Entitlement-check latency (p99 < 20ms). */
  readonly entitlementCheckMs: Histogram<string>;
}

/**
 * A thin, typed wrapper over a prom-client {@link Registry}. Owns the canonical
 * SLIs and exposes factory helpers so services register custom metrics against
 * the same registry (one `/metrics` surface per process).
 */
export class MetricsRegistry {
  readonly registry: Registry;
  readonly sli: CueSlis;

  constructor(serviceName: string, options: { collectDefault?: boolean } = {}) {
    this.registry = new Registry();
    this.registry.setDefaultLabels({ service: serviceName });
    if (options.collectDefault !== false) {
      collectDefaultMetrics({ register: this.registry });
    }
    this.sli = this.buildSlis();
  }

  /** Register (or reuse) a histogram on this registry. */
  histogram<T extends string = string>(config: HistogramConfiguration<T>): Histogram<T> {
    return new Histogram<T>({ ...config, registers: [this.registry] });
  }

  /** Register (or reuse) a counter on this registry. */
  counter<T extends string = string>(config: CounterConfiguration<T>): Counter<T> {
    return new Counter<T>({ ...config, registers: [this.registry] });
  }

  /** Register (or reuse) a gauge on this registry. */
  gauge<T extends string = string>(config: GaugeConfiguration<T>): Gauge<T> {
    return new Gauge<T>({ ...config, registers: [this.registry] });
  }

  /** Prometheus text exposition of every metric (for the `/metrics` route). */
  async metrics(): Promise<string> {
    return this.registry.metrics();
  }

  /** Content-type header value that accompanies {@link metrics}. */
  get contentType(): string {
    return PROM_CONTENT_TYPE;
  }

  private buildSlis(): CueSlis {
    const latency = [...LATENCY_MS_BUCKETS];
    return {
      cueServerLatencyMs: this.histogram<'region' | 'model' | 'tier'>({
        name: 'cue_server_latency_ms',
        help: 'Endpointing→ws-gateway egress latency (error-budgeted SLO, p95<900).',
        labelNames: ['region', 'model', 'tier'],
        buckets: latency,
      }),
      cueLatencyMs: this.histogram<'region' | 'model' | 'tier'>({
        name: 'cue_latency_ms',
        help: 'Endpointing→painted overlay token latency (reported-only, p95<1200).',
        labelNames: ['region', 'model', 'tier'],
        buckets: latency,
      }),
      sttPartialLagMs: this.histogram<'provider'>({
        name: 'stt_partial_lag_ms',
        help: 'STT partial transcript lag (p95<300).',
        labelNames: ['provider'],
        buckets: latency,
      }),
      llmTtftMs: this.histogram<'model'>({
        name: 'llm_ttft_ms',
        help: 'LLM time-to-first-token (p95<500).',
        labelNames: ['model'],
        buckets: latency,
      }),
      llmTokensPerSec: this.gauge<'model'>({
        name: 'llm_tokens_per_sec',
        help: 'LLM streaming throughput (target >40).',
        labelNames: ['model'],
      }),
      wsActiveConnections: this.gauge<'region' | 'service'>({
        name: 'ws_active_connections',
        help: 'Active WebSocket connections (capacity/saturation signal).',
        labelNames: ['region', 'service'],
      }),
      wsConnectionDurationS: this.histogram<string>({
        name: 'ws_connection_duration_s',
        help: 'WebSocket connection lifetime in seconds (drain/deploy behavior).',
        buckets: [...DURATION_S_BUCKETS],
      }),
      apiRequestDurationMs: this.histogram<'route' | 'method' | 'status'>({
        name: 'api_request_duration_ms',
        help: 'API request duration excl. LLM (p99<200).',
        labelNames: ['route', 'method', 'status'],
        buckets: latency,
      }),
      api5xxTotal: this.counter<'route'>({
        name: 'api_5xx_total',
        help: 'Count of API 5xx responses (→ ratio, target <0.1%).',
        labelNames: ['route'],
      }),
      minutesConsumedTotal: this.counter<'tier'>({
        name: 'minutes_consumed_total',
        help: 'Billable minutes consumed. Labelled by tier ONLY (cardinality guard: no userIdHash).',
        labelNames: ['tier'],
      }),
      sttStreamErrorsTotal: this.counter<'provider'>({
        name: 'stt_stream_errors_total',
        help: 'STT stream errors (triggers failover).',
        labelNames: ['provider'],
      }),
      llmStreamErrorsTotal: this.counter<'model'>({
        name: 'llm_stream_errors_total',
        help: 'LLM stream errors (model routing/fallback).',
        labelNames: ['model'],
      }),
      entitlementCheckMs: this.histogram<string>({
        name: 'entitlement_check_ms',
        help: 'Entitlement-check latency (p99<20).',
        buckets: [1, 2, 5, 10, 20, 50, 100, 200],
      }),
    };
  }
}

/** Convenience: create a metrics registry for a service. */
export function createMetrics(
  serviceName: string,
  options?: { collectDefault?: boolean },
): MetricsRegistry {
  return new MetricsRegistry(serviceName, options);
}
