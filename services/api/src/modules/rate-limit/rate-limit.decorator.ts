/**
 * Decorators to tune rate limiting per controller/handler.
 *
 *  - `@RateLimit({ windowSec, max })` overrides the global default for a route.
 *  - `@SkipRateLimit()` exempts a route entirely (e.g. health, webhooks that
 *    carry their own provider-side throttling + signature auth).
 */
import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import { RATE_LIMIT_RULE, SKIP_RATE_LIMIT, type RateLimitRule } from './rate-limit.types.js';

/** Attach a per-route rate-limit rule (overrides the global default). */
export const RateLimit = (rule: RateLimitRule): CustomDecorator =>
  SetMetadata(RATE_LIMIT_RULE, rule);

/** Exempt a route (or whole controller) from rate limiting. */
export const SkipRateLimit = (): CustomDecorator => SetMetadata(SKIP_RATE_LIMIT, true);
