/**
 * Telemetry bootstrap for @cue/ai-orchestrator — imported FIRST from `main.ts`
 * (before `@grpc/grpc-js`, `@cue/core`, and the AppModule) so OpenTelemetry
 * patches them at load time. The AI-path child spans (`stt.stream`,
 * `llm.generate`) are added inside @cue/core; this only starts the SDK + Sentry.
 * Redaction is enforced inside the SDKs — no transcript/PII ever leaves.
 */
import { closeSentry, initSentry, initTracing } from '@cue/observability';

const SERVICE_NAME = 'ai-orchestrator';

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
