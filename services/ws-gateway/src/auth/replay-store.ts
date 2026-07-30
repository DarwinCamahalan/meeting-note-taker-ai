/**
 * One-time-use guard for WS ticket `jti`s (docs/22 §5.2: `SETNX ws:ticket:{jti}`).
 *
 * MVP uses an in-process store with lazy TTL eviction — correct for a single
 * gateway instance. TODO(prod: Redis SETNX with TTL) — replace with a shared
 * store so replay protection holds across horizontally-scaled gateway tasks;
 * the gateway is otherwise stateless and safe to replace (docs/22 §5.4).
 */

/** Records used `jti`s until their ticket expiry so a ticket burns exactly once. */
export class ReplayGuard {
  /** jti -> expiry epoch-ms. */
  private readonly seen = new Map<string, number>();

  /**
   * Atomically claim a `jti`. Returns true if this is the first use (allowed);
   * false if the ticket was already consumed (replay → reject).
   */
  claim(jti: string, expEpochSec: number): boolean {
    this.evictExpired();
    if (this.seen.has(jti)) return false;
    this.seen.set(jti, expEpochSec * 1000);
    return true;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [jti, expiresAt] of this.seen) {
      if (expiresAt <= now) this.seen.delete(jti);
    }
  }
}
