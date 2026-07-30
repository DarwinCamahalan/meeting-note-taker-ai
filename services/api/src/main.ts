import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { AppConfig } from './config/app-config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(AppConfig);

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: config.webBaseUrl, credentials: true });
  app.enableShutdownHooks();

  await app.listen(config.apiPort);
  new Logger('Bootstrap').log(`@cue/api listening on http://localhost:${String(config.apiPort)}`);
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Fatal: failed to start @cue/api', error);
  process.exit(1);
});
