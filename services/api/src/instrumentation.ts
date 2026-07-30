/**
 * Telemetry bootstrap for @cue/api — imported FIRST from `main.ts` (before the
 * AppModule and any instrumented library) so OpenTelemetry can patch http/pg/etc.
 * at load time. Runs the OTel Node SDK + Sentry as import side-effects, and
 * registers a one-shot flush on SIGTERM/SIGINT so traces/errors aren't lost on
 * an ECS task drain. All PII/transcript redaction is enforced inside the SDKs
 * (pino redact + Sentry beforeSend), so nothing sensitive leaves the process.
 */
import { closeSentry, initSentry, initTracing } from '@cue/observability';

const SERVICE_NAME = 'api';

/** Live OTel tracing handle; `enabled` is false when OTEL_SDK_DISABLED=true. */
export const tracing = initTracing(SERVICE_NAME);

/** Whether Sentry actually initialized (false when no SENTRY_DSN is set). */
export const sentryEnabled = initSentry({ serviceName: SERVICE_NAME });

let flushed = false;

/** Flush + shut down tracing and Sentry exactly once. */
export async function flushTelemetry(): Promise<void> {
  if (flushed) return;
  flushed = true;
  await tracing.shutdown();
  await closeSentry();
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void flushTelemetry();
  });
}
