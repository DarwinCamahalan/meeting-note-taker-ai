// Telemetry MUST load before any instrumented import so OTel can patch
// http/pg/etc. at module-eval time. Keep this as the first import.
import './instrumentation.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createLogger, HealthRegistry } from '@cue/observability';
import { HEALTH_REGISTRY } from '@cue/observability/nest';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { AppConfig } from './config/app-config.js';
import { DbService } from './database/db.service.js';

const log = createLogger('api');

async function bootstrap(): Promise<void> {
  // `rawBody: true` preserves the exact request bytes on `req.rawBody` so the
  // Stripe webhook route can verify the signature, while all other routes still
  // receive normally-parsed JSON. Required by BillingWebhooksController.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });
  const config = app.get(AppConfig);

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.enableShutdownHooks();

  // Deep readiness: prove Postgres is reachable so `/readyz` drains the task at
  // the ALB when the DB is unreachable (rather than serving 5xx).
  const health = app.get<HealthRegistry>(HEALTH_REGISTRY);
  const db = app.get(DbService);
  health.registerReadiness('postgres', () => db.ping());

  // SIGTERM/SIGINT: flip readiness to `down` first so the load balancer stops
  // routing new traffic while Nest's shutdown hooks drain in-flight work. The
  // telemetry flush is owned by instrumentation.ts's own signal handler.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => health.beginDraining());
  }

  await app.listen(config.apiPort);
  log.info({ port: config.apiPort }, '@cue/api listening');
}

bootstrap().catch((error: unknown) => {
  log.error({ err: error instanceof Error ? error.message : String(error) }, 'failed to start @cue/api');
  process.exit(1);
});
