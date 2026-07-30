/**
 * Lazy, fail-open Redis client provider for the rate limiter.
 *
 * When `REDIS_URL` is unset (local dev) the provider yields `null` and the
 * limiter becomes a no-op — the app boots and serves without Redis. When set,
 * we connect lazily with a tight per-request budget and `enableOfflineQueue`
 * OFF so a Redis blip never *queues* and stalls request admission: it errors
 * fast and the limiter fails OPEN (per 70 §2.6 "fail-open admission").
 */
import { Logger, type Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig } from '../../config/app-config.js';
import { RATE_LIMIT_REDIS } from './rate-limit.types.js';

/** The concrete client type the limiter consumes (or `null` when disabled). */
export type RateLimitRedis = Redis | null;

/** Factory provider binding {@link RATE_LIMIT_REDIS} to a client or `null`. */
export const rateLimitRedisProvider: Provider = {
  provide: RATE_LIMIT_REDIS,
  inject: [AppConfig],
  useFactory: (config: AppConfig): RateLimitRedis => {
    const logger = new Logger('RateLimitRedis');
    if (!config.redisUrl) {
      logger.warn('REDIS_URL unset — request rate limiting is DISABLED (dev fail-open).');
      return null;
    }
    const client = new Redis(config.redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1_000,
      // Backoff reconnect, capped — the control cluster fails over in seconds.
      retryStrategy: (times: number): number => Math.min(times * 200, 2_000),
    });
    client.on('error', (err: Error) => {
      // Never throw from the event handler; the limiter degrades to fail-open.
      logger.warn(`control Redis error (rate limiter fails open): ${err.message}`);
    });
    client.connect().catch((err: unknown) => {
      logger.warn(`control Redis initial connect failed: ${message(err)}`);
    });
    return client;
  },
};

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
