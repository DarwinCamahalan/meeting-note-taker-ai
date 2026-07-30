/**
 * BillingWebhooksService — verifies + dedupes + dispatches Stripe events. Keeps
 * the controller thin and returns a discriminated result so the controller can
 * choose the HTTP status (200 ack vs 400 bad signature) without exceptions on
 * the hot path.
 */
import { Injectable, Logger } from '@nestjs/common';
import type Stripe from 'stripe';
import { StripeService } from '../billing/stripe.service.js';
import { ReconcilerService } from './reconciler.service.js';
import { WebhookDedupeStore } from './webhook-dedupe.store.js';

/** Discriminated outcome of processing one webhook delivery. */
export type WebhookResult = { ok: true } | { ok: false; error: string };

@Injectable()
export class BillingWebhooksService {
  private readonly logger = new Logger(BillingWebhooksService.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly reconciler: ReconcilerService,
    private readonly dedupe: WebhookDedupeStore,
  ) {}

  async process(rawBody: Buffer, signature: string): Promise<WebhookResult> {
    let event: Stripe.Event;
    try {
      event = this.stripe.constructWebhookEvent(rawBody, signature);
    } catch (err) {
      this.logger.warn(`Rejected webhook (signature/verify failed): ${errText(err)}`);
      return { ok: false, error: 'invalid signature' };
    }

    // Fast-path dedupe; durable idempotency is the reconciler's upserts.
    if (!this.dedupe.markFresh(event.id)) {
      this.logger.debug(`Duplicate webhook ${event.id} short-circuited.`);
      return { ok: true };
    }

    try {
      await this.reconciler.dispatch(event);
    } catch (err) {
      // Reconciliation failed AFTER a valid signature: return ok so Stripe does
      // not hammer retries on a persistent bug, but log loudly for alerting.
      // (A durable event log + retry queue is the phase-3 hardening — 51 §5.2.)
      this.logger.error(`Reconcile failed for ${event.type} (${event.id})`, err as Error);
    }
    return { ok: true };
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
