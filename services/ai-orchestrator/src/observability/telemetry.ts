/**
 * DI wiring for the ai-orchestrator's observability primitives. The metrics +
 * health registries are Nest-owned singletons so `GrpcServerService` (and the
 * per-stream sessions it spawns) can record SLIs against the same registry that
 * `main.ts` scrapes on the standalone `/metrics` server.
 */
import { createLogger, createMetrics, HealthRegistry, type CueLogger, type MetricsRegistry } from '@cue/observability';
import type { Provider } from '@nestjs/common';

const SERVICE_NAME = 'ai-orchestrator';

/** DI token for the process {@link MetricsRegistry}. */
export const METRICS_REGISTRY = Symbol('ORCHESTRATOR_METRICS_REGISTRY');
/** DI token for the process {@link HealthRegistry}. */
export const HEALTH_REGISTRY = Symbol('ORCHESTRATOR_HEALTH_REGISTRY');
/** DI token for the process pino {@link CueLogger}. */
export const CUE_LOGGER = Symbol('ORCHESTRATOR_CUE_LOGGER');

/** Singletons shared by the Nest providers and the standalone scrape server. */
export function createObservabilityProviders(): {
  providers: Provider[];
  metrics: MetricsRegistry;
  health: HealthRegistry;
  logger: CueLogger;
} {
  const metrics = createMetrics(SERVICE_NAME);
  const health = new HealthRegistry(SERVICE_NAME);
  const logger = createLogger(SERVICE_NAME);
  return {
    metrics,
    health,
    logger,
    providers: [
      { provide: METRICS_REGISTRY, useValue: metrics },
      { provide: HEALTH_REGISTRY, useValue: health },
      { provide: CUE_LOGGER, useValue: logger },
    ],
  };
}
