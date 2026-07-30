import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

/**
 * Bootstrap the gRPC-only orchestrator. There is no HTTP server, so we use a
 * Nest application *context*; `GrpcServerService` starts the gRPC server on
 * module init. `enableShutdownHooks` wires SIGTERM/SIGINT to onModuleDestroy so
 * the server drains gracefully.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  new Logger('bootstrap').log('@cue/ai-orchestrator started');
}

bootstrap().catch((err: unknown) => {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  // eslint-disable-next-line no-console
  console.error('[ai-orchestrator] fatal during bootstrap:', detail);
  process.exit(1);
});
