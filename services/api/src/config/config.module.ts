/**
 * Global ConfigModule — validates the environment once and exposes the typed
 * {@link AppConfig} to the whole app via its class token.
 */
import { Global, Module } from '@nestjs/common';
import { AppConfig, loadConfig } from './app-config.js';

@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: (): AppConfig => loadConfig() }],
  exports: [AppConfig],
})
export class ConfigModule {}
