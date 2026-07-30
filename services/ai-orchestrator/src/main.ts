// Telemetry must load before `@grpc/grpc-js`/`@cue/core`/AppModule — keep first.
import { flushTelemetry } from './instrumentation.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  createLogger,
  startObservabilityServer,
  type HealthRegistry,
  type MetricsRegistry,
} from '@cue/observability';
import { AppModule } from './app.module.js';
import { ORCHESTRATOR_CONFIG, type OrchestratorEnv } from './config/env.js';
import { HEALTH_REGISTRY, METRICS_REGISTRY } from './observability/telemetry.js';

/**
 * Bootstrap the gRPC-only orchestrator. There is no HTTP server for application
 * traffic, so we use a Nest application *context*; `GrpcServerService` starts the
 * gRPC server on module init. A standalone `/metrics` + `/readyz` + `/livez`
 * listener runs alongside for scrape + ALB probes. `enableShutdownHooks` wires
 * SIGTERM/SIGINT to onModuleDestroy so the gRPC server drains gracefully; we
 * additionally flip readiness to draining and flush telemetry.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();

  const config = app.get<OrchestratorEnv>(ORCHESTRATOR_CONFIG);
  const metrics = app.get<MetricsRegistry>(METRICS_REGISTRY);
  const health = app.get<HealthRegistry>(HEALTH_REGISTRY);

  const obsServer = startObservabilityServer({ metrics, health, port: config.metricsPort });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      // Drain readiness first (ALB stops routing), then close the scrape server
      // and flush telemetry. Nest's shutdown hooks drain the gRPC server.
      health.beginDraining();
      void obsServer.close().then(() => flushTelemetry());
    });
  }
}

bootstrap().catch((err: unknown) => {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  createLogger('ai-orchestrator').error({ err: detail }, 'fatal during bootstrap');
  process.exit(1);
});
