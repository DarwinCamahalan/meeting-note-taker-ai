/**
 * @cue/observability — the Cue observability + reliability foundation.
 *
 * Public surface (framework-agnostic): OpenTelemetry tracing bootstrap, the
 * pino logger factory (PII-redacted, trace-bound), the Prometheus metrics
 * registry + canonical SLI catalog, the Sentry init/scrub helpers, the
 * liveness/readiness registry, the redaction contract, and the provider
 * reliability primitives (circuit breaker + backoff).
 *
 * The NestJS integration (module, controller, interceptors) lives behind the
 * `@cue/observability/nest` subpath so services that don't run NestJS
 * (ws-gateway, ai-orchestrator) never pull `@nestjs/*` into their runtime.
 * The reliability primitives are also re-exported at `@cue/observability/reliability`.
 */
export * from './tracing.js';
export * from './logger.js';
export * from './metrics.js';
export * from './sentry.js';
export * from './health.js';
export * from './http-metrics-server.js';
export * from './redaction.js';
export * from './reliability/index.js';
