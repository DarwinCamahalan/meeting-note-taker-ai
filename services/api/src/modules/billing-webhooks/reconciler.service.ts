/**
 * ReconcilerService — the ONLY writer that turns Stripe billing state into the
 * `subscriptions` + `entitlements` + `orgs.plan` projection (51 §5). Every
 * handler is written to be ORDER-INDEPENDENT: it re-resolves state from the
 * event's current object (never applies a delta) and upserts, so out-of-order
 * or duplicated deliveries converge to the same result (idempotent).
 */
import { Injectable, Logger } from '@nestjs/common';
import type Stripe from 'stripe';
import { desc, eq } from 'drizzle-orm';
import { orgs, subscriptions } from '@cue/db';
import type { NewSubscription } from '@cue/db';
import type { PlanTier, SubscriptionStatus } from '@cue/types';
import { DbService } from '../../database/db.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { tierForPriceId, type SelfServeTier } from '../billing/stripe.catalog.js';
import { AppConfig } from '../../config/app-config.js';

@Injectable()
export class ReconcilerService {
  private readonly logger = new Logger(ReconcilerService.name);

  constructor(
    private readonly config: AppConfig,
    private readonly db: DbService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Route a verified Stripe event to its handler. Unlisted events are no-ops. */
  async dispatch(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.onSubscriptionUpsert(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        await this.onInvoiceStatus(event.data.object, 'active');
        break;
      case 'invoice.payment_failed':
        await this.onInvoiceStatus(event.data.object, 'past_due');
        break;
      default:
        this.logger.debug(`Ignoring unhandled Stripe event: ${event.type}`);
    }
  }

  /* --------------------------- event handlers --------------------------- */

  /** Attach the Stripe customer id to the org; `subscription.*` finalizes tier. */
  private async onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const orgId = session.client_reference_id ?? metaOrgId(session.metadata);
    const customerId = idOf(session.customer);
    if (!orgId || !customerId) {
      this.logger.warn('checkout.session.completed missing orgId/customer; skipping.');
      return;
    }
    await this.db.db
      .update(orgs)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(orgs.id, orgId));
  }

  private async onSubscriptionUpsert(sub: Stripe.Subscription): Promise<void> {
    const orgId = await this.resolveOrgId(sub);
    if (!orgId) {
      this.logger.warn(`subscription ${sub.id} could not be attributed to an org; skipping.`);
      return;
    }

    const base = this.baseItem(sub);
    if (!base) {
      this.logger.warn(`subscription ${sub.id} has no recognized base tier price; skipping.`);
      return;
    }
    const { tier, priceId, seats } = base;
    const status = sub.status as SubscriptionStatus;

    await this.upsertSubscription({
      orgId,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      tier,
      status,
      seats,
      currentPeriodEnd: unixToDate(sub.current_period_end),
      trialEndsAt: sub.trial_end ? unixToDate(sub.trial_end) : null,
      cancelAtPeriodEnd: this.cancelAt(sub),
    });

    // Downgrades take effect at period end; while a scheduled cancel is pending
    // and the sub is still active/trialing, keep the paid gates. On terminal
    // states (canceled/unpaid/incomplete_expired) fall back to Free gates.
    const effectiveTier = this.effectiveTier(tier, status);
    await this.setOrgPlan(orgId, effectiveTier);
    await this.entitlements.reconcile(orgId, effectiveTier, status);
  }

  private async onSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
    const orgId = await this.resolveOrgId(sub);
    if (!orgId) {
      return;
    }
    await this.db.db
      .update(subscriptions)
      .set({ status: 'canceled', updatedAt: new Date() })
      .where(eq(subscriptions.stripeSubscriptionId, sub.id));
    await this.setOrgPlan(orgId, 'free');
    await this.entitlements.reconcile(orgId, 'free', 'canceled');
  }

  /**
   * invoice.paid -> clear dunning (status active); invoice.payment_failed ->
   * enter grace (past_due) while KEEPING the paid tier's gates (50 §8). Tier is
   * not re-derived here — `subscription.updated` owns tier changes.
   */
  private async onInvoiceStatus(
    invoice: Stripe.Invoice,
    status: Extract<SubscriptionStatus, 'active' | 'past_due'>,
  ): Promise<void> {
    const subscriptionId = idOf(invoice.subscription);
    if (!subscriptionId) {
      return;
    }
    const [row] = await this.db.db
      .select({ orgId: subscriptions.orgId, tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
      .limit(1);
    if (!row) {
      this.logger.debug(`invoice for unknown subscription ${subscriptionId}; skipping.`);
      return;
    }
    await this.db.db
      .update(subscriptions)
      .set({ status, updatedAt: new Date() })
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
    // Keep the tier's gates through the grace period; only status changes.
    await this.entitlements.reconcile(row.orgId, row.tier as PlanTier, status);
  }

  /* ----------------------------- helpers ------------------------------- */

  private baseItem(
    sub: Stripe.Subscription,
  ): { tier: SelfServeTier; priceId: string; seats: number } | null {
    for (const item of sub.items.data) {
      const tier = tierForPriceId(this.config, item.price.id);
      if (tier) {
        return { tier, priceId: item.price.id, seats: Math.max(item.quantity ?? 1, 1) };
      }
    }
    return null;
  }

  private effectiveTier(tier: PlanTier, status: SubscriptionStatus): PlanTier {
    const terminal: SubscriptionStatus[] = ['canceled', 'incomplete_expired', 'unpaid'];
    return terminal.includes(status) ? 'free' : tier;
  }

  private cancelAt(sub: Stripe.Subscription): Date | null {
    if (sub.cancel_at) {
      return unixToDate(sub.cancel_at);
    }
    if (sub.cancel_at_period_end) {
      return unixToDate(sub.current_period_end);
    }
    return null;
  }

  private async resolveOrgId(sub: Stripe.Subscription): Promise<string | null> {
    const fromMeta = metaOrgId(sub.metadata);
    if (fromMeta) {
      return fromMeta;
    }
    const [existing] = await this.db.db
      .select({ orgId: subscriptions.orgId })
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, sub.id))
      .limit(1);
    if (existing) {
      return existing.orgId;
    }
    const customerId = idOf(sub.customer);
    if (!customerId) {
      return null;
    }
    const [org] = await this.db.db
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.stripeCustomerId, customerId))
      .orderBy(desc(orgs.createdAt))
      .limit(1);
    return org?.id ?? null;
  }

  private async upsertSubscription(values: {
    orgId: string;
    stripeSubscriptionId: string;
    stripePriceId: string;
    tier: PlanTier;
    status: SubscriptionStatus;
    seats: number;
    currentPeriodEnd: Date;
    trialEndsAt: Date | null;
    cancelAtPeriodEnd: Date | null;
  }): Promise<void> {
    const row: NewSubscription = {
      orgId: values.orgId,
      stripeSubscriptionId: values.stripeSubscriptionId,
      stripePriceId: values.stripePriceId,
      tier: values.tier,
      status: values.status,
      seats: String(values.seats),
      currentPeriodEnd: values.currentPeriodEnd,
      trialEndsAt: values.trialEndsAt,
      cancelAtPeriodEnd: values.cancelAtPeriodEnd,
    };
    await this.db.db
      .insert(subscriptions)
      .values(row)
      .onConflictDoUpdate({
        target: subscriptions.stripeSubscriptionId,
        set: {
          stripePriceId: values.stripePriceId,
          tier: values.tier,
          status: values.status,
          seats: String(values.seats),
          currentPeriodEnd: values.currentPeriodEnd,
          trialEndsAt: values.trialEndsAt,
          cancelAtPeriodEnd: values.cancelAtPeriodEnd,
          updatedAt: new Date(),
        },
      });
  }

  private async setOrgPlan(orgId: string, plan: PlanTier): Promise<void> {
    await this.db.db
      .update(orgs)
      .set({ plan, updatedAt: new Date() })
      .where(eq(orgs.id, orgId));
  }
}

/* --------------------------- pure utilities --------------------------- */

function unixToDate(seconds: number): Date {
  return new Date(seconds * 1000);
}

/** Stripe fields are `string | Object | null` when un-expanded; extract the id. */
function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return typeof value === 'string' ? value : value.id;
}

function metaOrgId(metadata: Stripe.Metadata | null | undefined): string | null {
  const orgId = metadata?.['orgId'];
  return typeof orgId === 'string' && orgId.length > 0 ? orgId : null;
}
