/**
 * Types + DI tokens + metadata keys for the Redis-backed rate limiter
 * (docs/70-scalability §2.6 control Redis, §5.5 per-tenant fairness).
 */

/** A single fixed-window rate-limit rule. */
export interface RateLimitRule {
  /** Window length in seconds. */
  readonly windowSec: number;
  /** Max requests allowed within the window. */
  readonly max: number;
}

/** Outcome of a single admission check. */
export interface RateLimitResult {
  /** Whether the request is admitted. Fail-open ⇒ always `true` when Redis is down. */
  readonly allowed: boolean;
  /** The rule ceiling (for `RateLimit-Limit`). */
  readonly limit: number;
  /** Remaining budget in the current window (for `RateLimit-Remaining`). */
  readonly remaining: number;
  /** Milliseconds until the window resets (for `RateLimit-Reset`). */
  readonly resetMs: number;
}

/** Reflector metadata key carrying a per-route {@link RateLimitRule} override. */
export const RATE_LIMIT_RULE = 'cue:rate-limit:rule';

/** Reflector metadata key marking a handler/controller as exempt. */
export const SKIP_RATE_LIMIT = 'cue:rate-limit:skip';

/** DI token for the (nullable) shared Redis client — `null` disables limiting. */
export const RATE_LIMIT_REDIS = Symbol('RATE_LIMIT_REDIS');
