/**
 * Global rate-limit module. Provides the Redis client (or a fail-open null),
 * the limiter service, and registers {@link RateLimitGuard} as an APP_GUARD so
 * every route is covered by default. Individual routes opt out with
 * `@SkipRateLimit()` or tune limits with `@RateLimit()`.
 */
import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { rateLimitRedisProvider } from './rate-limit.redis.js';
import { RateLimiterService } from './rate-limiter.service.js';
import { RateLimitGuard } from './rate-limit.guard.js';

@Global()
@Module({
  providers: [
    rateLimitRedisProvider,
    RateLimiterService,
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [RateLimiterService],
})
export class RateLimitModule {}
