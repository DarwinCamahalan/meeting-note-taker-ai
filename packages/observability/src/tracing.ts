/**
 * OpenTelemetry tracing bootstrap (per 61-observability §5 "Distributed tracing
 * — OTel, OTLP export").
 *
 * `initTracing` must run BEFORE the app imports any instrumented library, so
 * services call it at the very top of their entrypoint (e.g. an
 * `--import ./tracing.js` preload or the first line of `main.ts`). Auto
 * instrumentation covers http/express/grpc/pg/redis; the AI-path child spans
 * (`stt.stream`, `llm.generate`, …) are added manually in @cue/core.
 */
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

export interface InitTracingOptions {
  /** OTLP/HTTP traces endpoint; defaults to `OTEL_EXPORTER_OTLP_ENDPOINT` env. */
  endpoint?: string;
  /**
   * Master switch. Defaults to enabled unless `OTEL_SDK_DISABLED=true`. When
   * disabled, returns an inert handle so callers need no branching.
   */
  enabled?: boolean;
  /** Deployment environment tag (dev/staging/prod); defaults to `NODE_ENV`. */
  environment?: string;
}

/** Handle returned by {@link initTracing}; used for graceful SIGTERM shutdown. */
export interface TracingHandle {
  /** Flush + shut down the SDK. Safe to call multiple times; resolves once. */
  shutdown(): Promise<void>;
  /** Whether tracing actually started (false when disabled/no-op). */
  readonly enabled: boolean;
}

const NOOP_HANDLE: TracingHandle = {
  shutdown: () => Promise.resolve(),
  enabled: false,
};

/**
 * Initialize and start the OTel Node SDK for `serviceName`. The service name and
 * environment are published via the standard `OTEL_*` env resource detectors,
 * so no explicit `Resource` construction (version-sensitive across SDK minors)
 * is needed here.
 */
export function initTracing(serviceName: string, options: InitTracingOptions = {}): TracingHandle {
  const disabledByEnv = process.env['OTEL_SDK_DISABLED'] === 'true';
  const enabled = options.enabled ?? !disabledByEnv;
  if (!enabled) return NOOP_HANDLE;

  // Feed the env resource detector (avoids importing @opentelemetry/resources).
  process.env['OTEL_SERVICE_NAME'] = serviceName;
  const environment = options.environment ?? process.env['NODE_ENV'] ?? 'development';
  const existingAttrs = process.env['OTEL_RESOURCE_ATTRIBUTES'];
  const envAttr = `deployment.environment=${environment}`;
  process.env['OTEL_RESOURCE_ATTRIBUTES'] = existingAttrs
    ? `${existingAttrs},${envAttr}`
    : envAttr;

  const endpoint = options.endpoint ?? process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  const traceExporter = new OTLPTraceExporter(endpoint ? { url: normalizeTracesUrl(endpoint) } : {});

  const sdk = new NodeSDK({
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs spans are noise on a latency-critical service; disable.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  let shutdownPromise: Promise<void> | null = null;
  return {
    enabled: true,
    shutdown: () => {
      shutdownPromise ??= sdk.shutdown();
      return shutdownPromise;
    },
  };
}

/**
 * Accept either a base OTLP endpoint (`http://host:4318`) or a full traces URL;
 * append the standard `/v1/traces` path when a bare base is given.
 */
function normalizeTracesUrl(endpoint: string): string {
  const trimmed = endpoint.replace(/\/+$/, '');
  return trimmed.endsWith('/v1/traces') ? trimmed : `${trimmed}/v1/traces`;
}
