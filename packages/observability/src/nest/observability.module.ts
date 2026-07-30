/**
 * ObservabilityModule — the one import that gives a NestJS service its
 * `/metrics`, `/readyz`, `/livez` surface plus request logging + metrics
 * interceptors, all wired to a single per-process logger, metrics registry, and
 * health registry.
 *
 * Usage (in a service's AppModule):
 *   ObservabilityModule.forRoot({ serviceName: 'api' })
 *
 * The registries are exported so feature modules can inject them (e.g. the
 * billing module observing `minutes_consumed`, or a readiness check registering
 * the Postgres ping).
 */
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Global, Module, type DynamicModule, type Provider } from '@nestjs/common';
import { HealthRegistry } from '../health.js';
import { createLogger, type CreateLoggerOptions } from '../logger.js';
import { MetricsRegistry } from '../metrics.js';
import { LoggingInterceptor } from './logging.interceptor.js';
import { MetricsInterceptor } from './metrics.interceptor.js';
import { ObservabilityController } from './observability.controller.js';
import { CUE_LOGGER, HEALTH_REGISTRY, METRICS_REGISTRY, OBSERVABILITY_OPTIONS } from './tokens.js';

export interface ObservabilityModuleOptions {
  /** Service name stamped on logs, metrics default labels, and health reports. */
  serviceName: string;
  /** pino options passed to {@link createLogger}. */
  logger?: CreateLoggerOptions;
  /** Collect Node/process default metrics. Default true. */
  collectDefaultMetrics?: boolean;
  /** Register the request-logging interceptor globally. Default true. */
  requestLogging?: boolean;
  /** Register the request-metrics interceptor globally. Default true. */
  requestMetrics?: boolean;
}

@Global()
@Module({})
export class ObservabilityModule {
  static forRoot(options: ObservabilityModuleOptions): DynamicModule {
    const logger = createLogger(options.serviceName, options.logger);
    const metrics = new MetricsRegistry(options.serviceName, {
      collectDefault: options.collectDefaultMetrics !== false,
    });
    const health = new HealthRegistry(options.serviceName);

    const coreProviders: Provider[] = [
      { provide: OBSERVABILITY_OPTIONS, useValue: options },
      { provide: CUE_LOGGER, useValue: logger },
      { provide: METRICS_REGISTRY, useValue: metrics },
      { provide: HEALTH_REGISTRY, useValue: health },
    ];

    const interceptorProviders: Provider[] = [];
    if (options.requestLogging !== false) {
      interceptorProviders.push(LoggingInterceptor, {
        provide: APP_INTERCEPTOR,
        useExisting: LoggingInterceptor,
      });
    }
    if (options.requestMetrics !== false) {
      interceptorProviders.push(MetricsInterceptor, {
        provide: APP_INTERCEPTOR,
        useExisting: MetricsInterceptor,
      });
    }

    return {
      module: ObservabilityModule,
      controllers: [ObservabilityController],
      providers: [...coreProviders, ...interceptorProviders],
      exports: [CUE_LOGGER, METRICS_REGISTRY, HEALTH_REGISTRY, OBSERVABILITY_OPTIONS],
    };
  }
}
