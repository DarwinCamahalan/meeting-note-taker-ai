/**
 * Best-effort in-process dedupe for Stripe webhook `event.id`s. Stripe retries
 * aggressively, so a fast short-circuit avoids redundant reconciliation work.
 *
 * This is a FAST-PATH optimization only — the durable idempotency guarantee is
 * the reconciler's order-independent upserts (subscriptions keyed by
 * stripeSubscriptionId, one entitlement snapshot row per org). A restart clears
 * this cache, and a replayed event simply re-converges to the same state.
 *
 * TODO(durable): add a `processed_webhook_events(event_id PK)` table in @cue/db
 * and insert-before-process so dedupe survives restarts + horizontal scale-out
 * (51 §5.2).
 */
import { Injectable } from '@nestjs/common';

/** Bounded FIFO set — evicts oldest ids once capacity is exceeded. */
@Injectable()
export class WebhookDedupeStore {
  private readonly seen = new Set<string>();
  private readonly order: string[] = [];
  private readonly capacity = 5_000;

  /**
   * Mark an event id as seen. Returns `true` when it is FRESH (first sighting,
   * caller should process) and `false` when it is a duplicate (short-circuit).
   */
  markFresh(eventId: string): boolean {
    if (this.seen.has(eventId)) {
      return false;
    }
    this.seen.add(eventId);
    this.order.push(eventId);
    if (this.order.length > this.capacity) {
      const evicted = this.order.shift();
      if (evicted !== undefined) {
        this.seen.delete(evicted);
      }
    }
    return true;
  }
}
