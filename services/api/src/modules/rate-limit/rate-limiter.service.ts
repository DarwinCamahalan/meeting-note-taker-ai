/**
 * Fixed-window rate limiter backed by control Redis (docs/70-scalability §2.6).
 *
 * The window counter is an atomic `INCR` + first-hit `PEXPIRE`, run as a single
 * Lua script so the increment and the TTL set can never race (two concurrent
 * first-hits could otherwise leave a key with no expiry — a permanent block).
 * On ANY Redis error the check fails OPEN: request admission must never hang or
 * hard-fail on a control-plane blip — that is the §2.6 contract.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { RATE_LIMIT_REDIS, type RateLimitResult, type RateLimitRule } from './rate-limit.types.js';
import type { RateLimitRedis } from './rate-limit.redis.js';

/**
 * KEYS[1] = counter key; ARGV[1] = window ms; ARGV[2] = max.
 * Returns { count, pttl }. Sets the TTL only on the first hit of the window.
 */
const WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local pttl = redis.call('PTTL', KEYS[1])
return { count, pttl }
`;

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);

  constructor(@Inject(RATE_LIMIT_REDIS) private readonly redis: RateLimitRedis) {}

  /** True when a Redis client is configured (limiting is active). */
  get enabled(): boolean {
    return this.redis !== null;
  }

  /**
   * Consume one unit against `identity` under `rule`. Fail-open: a disabled or
   * unreachable Redis returns `allowed: true` with a full budget.
   */
  async consume(identity: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const windowMs = rule.windowSec * 1_000;
    if (!this.redis) return allowAll(rule.max, windowMs);

    const key = `cue:rl:${String(rule.windowSec)}:${identity}`;
    try {
      const raw = (await this.redis.eval(
        WINDOW_SCRIPT,
        1,
        key,
        String(windowMs),
        String(rule.max),
      )) as [number, number];
      const count = Number(raw[0]);
      const pttl = Number(raw[1]);
      const resetMs = pttl >= 0 ? pttl : windowMs;
      const remaining = Math.max(0, rule.max - count);
      return {
        allowed: count <= rule.max,
        limit: rule.max,
        remaining,
        resetMs,
      };
    } catch (err) {
      this.logger.warn(`rate-limit check failed open: ${message(err)}`);
      return allowAll(rule.max, windowMs);
    }
  }

  /** Close the client on shutdown (best-effort). */
  async onModuleDestroy(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}

function allowAll(max: number, windowMs: number): RateLimitResult {
  return { allowed: true, limit: max, remaining: max, resetMs: windowMs };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
