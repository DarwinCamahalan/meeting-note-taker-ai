/**
 * Telemetry bootstrap for @cue/ws-gateway — imported FIRST from `main.ts`
 * (before `ws`/`@grpc/grpc-js` load) so OpenTelemetry patches them at load time.
 * Runs the OTel Node SDK + Sentry as import side-effects. Redaction is enforced
 * inside the SDKs, so no transcript/PII ever leaves the process.
 */
import { closeSentry, initSentry, initTracing } from '@cue/observability';

const SERVICE_NAME = 'ws-gateway';

/** Live OTel tracing handle; `enabled` is false when OTEL_SDK_DISABLED=true. */
export const tracing = initTracing(SERVICE_NAME);

/** Whether Sentry actually initialized (false when no SENTRY_DSN is set). */
export const sentryEnabled = initSentry({ serviceName: SERVICE_NAME });

let flushed = false;

/** Flush + shut down tracing and Sentry exactly once (called on drain). */
export async function flushTelemetry(): Promise<void> {
  if (flushed) return;
  flushed = true;
  await tracing.shutdown();
  await closeSentry();
}
