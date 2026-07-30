/**
 * UsageService — the live-minute metering ledger. It:
 *   - appends immutable `usage_events` rows as sessions consume minutes,
 *   - computes the enforcement state (ok -> soft_warn -> overage | hard_capped)
 *     against the plan allotment (50 §6.3),
 *   - reports the billable (over-quota) portion to Stripe's metered overage item
 *     idempotently per session (51 §7),
 *   - and summarizes the current period for the desktop meter (`UsageSummary`).
 *
 * Live-minute COUNTING itself is owned by `ws-gateway` (it holds the audio
 * socket); this service is the persistence + Stripe-reporting authority that the
 * gateway/metering worker calls into.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MetricsRegistry } from '@cue/observability';
import { METRICS_REGISTRY } from '@cue/observability/nest';
import type Stripe from 'stripe';
import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { orgs, subscriptions, usageEvents } from '@cue/db';
import type { NewUsageEvent } from '@cue/db';
import type { PlanTier, UsageEnforcementState, UsageSummary } from '@cue/types';
import { currentBillingPeriod } from '../../common/billing-period.js';
import { AppConfig } from '../../config/app-config.js';
import { DbService } from '../../database/db.service.js';
import {
  liveMinutesLimit,
  overageAllowed as tierOverageAllowed,
} from '../entitlements/entitlements.catalog.js';
import { isOveragePriceId, OVERAGE_RATE_USD } from '../billing/stripe.catalog.js';
import { StripeService } from '../billing/stripe.service.js';
import {
  SOFT_WARN_RATIO,
  UNLIMITED_MINUTES,
  type RecordLiveMinutesResult,
  type UsageComputation,
} from './types.js';

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    private readonly config: AppConfig,
    private readonly db: DbService,
    private readonly stripe: StripeService,
    @Inject(METRICS_REGISTRY) private readonly metrics: MetricsRegistry,
  ) {}

  /** The `GET /v1/billing/usage` summary for an org's current period. */
  async summarize(orgId: string): Promise<UsageSummary> {
    const c = await this.compute(orgId);
    return {
      orgId,
      periodStart: c.periodStart.toISOString(),
      periodEnd: c.periodEnd.toISOString(),
      liveMinutesUsed: c.used,
      liveMinutesIncluded: c.included,
      liveMinutesRemaining: c.remaining,
      overageMinutes: c.overageMinutes,
      overageRateUsd: OVERAGE_RATE_USD,
      overageAllowed: c.overageAllowed,
      state: c.state,
    };
  }

  /** Pre-session / mid-stream gate: the current enforcement state for an org. */
  async enforcementState(orgId: string): Promise<UsageEnforcementState> {
    return (await this.compute(orgId)).state;
  }

  /**
   * Record whole live minutes a session consumed (rounded up by the caller at
   * session close), then report the billable over-quota portion to Stripe.
   * Idempotent per session: a repeat call for the same `sessionId` short-circuits
   * (the ledger already carries that session's row) so retries never double-bill.
   */
  async recordLiveMinutes(
    orgId: string,
    sessionId: string,
    minutes: number,
  ): Promise<RecordLiveMinutesResult> {
    if (minutes <= 0) {
      const state = await this.enforcementState(orgId);
      return { state, billableMinutes: 0, reportedToStripe: false };
    }

    // Idempotency guard: one live_minutes row per session (the metering worker
    // reports once at close). A durable UNIQUE(session_id) belongs in @cue/db;
    // until then this check + Stripe's idempotency key are the guarantee.
    const already = await this.sessionAlreadyRecorded(orgId, sessionId);
    if (already) {
      const state = await this.enforcementState(orgId);
      return { state, billableMinutes: 0, reportedToStripe: false };
    }

    const before = await this.compute(orgId);

    const row: NewUsageEvent = {
      orgId,
      sessionId,
      kind: 'live_minutes',
      quantity: String(minutes),
      unit: 'minutes',
      occurredAt: new Date(),
    };
    const [inserted] = await this.db.db.insert(usageEvents).values(row).returning({
      id: usageEvents.id,
    });

    const billableMinutes = this.billableDelta(before.used, minutes, before.included);
    const after = await this.compute(orgId);

    // Billing-truth SLI: minutes are labelled by tier ONLY (cardinality guard —
    // never userId/orgId). Recorded once per session alongside the ledger row.
    this.metrics.sli.minutesConsumedTotal.inc({ tier: after.tier }, minutes);

    let reportedToStripe = false;
    if (billableMinutes > 0 && after.overageAllowed && this.stripe.isConfigured) {
      reportedToStripe = await this.reportOverage(orgId, sessionId, billableMinutes, inserted?.id);
    }

    return { state: after.state, billableMinutes, reportedToStripe };
  }

  /* ----------------------------- internals ----------------------------- */

  private async compute(orgId: string): Promise<UsageComputation> {
    const { tier, seats, periodEnd } = await this.planContext(orgId);
    const period = currentBillingPeriod(new Date(), periodEnd);
    const used = await this.minutesUsed(orgId, period.start, period.end);

    const perPeriod = liveMinutesLimit(tier);
    const included =
      perPeriod === null ? UNLIMITED_MINUTES : perPeriod * (tier === 'team' ? seats : 1);
    const remaining = Math.max(included - used, 0);
    const overageAllowed = tierOverageAllowed(tier);
    const overageMinutes = overageAllowed ? Math.max(used - included, 0) : 0;

    return {
      tier,
      periodStart: period.start,
      periodEnd: period.end,
      used,
      included,
      remaining,
      overageMinutes,
      overageAllowed,
      state: this.stateFor(used, included, overageAllowed),
    };
  }

  private stateFor(
    used: number,
    included: number,
    overageAllowed: boolean,
  ): UsageEnforcementState {
    if (used > included) {
      return overageAllowed ? 'overage' : 'hard_capped';
    }
    if (included > 0 && used >= included * SOFT_WARN_RATIO) {
      return 'soft_warn';
    }
    return 'ok';
  }

  /** The over-quota portion attributable to THIS session's minutes. */
  private billableDelta(usedBefore: number, minutes: number, included: number): number {
    const overBefore = Math.max(usedBefore - included, 0);
    const overAfter = Math.max(usedBefore + minutes - included, 0);
    return overAfter - overBefore;
  }

  private async planContext(
    orgId: string,
  ): Promise<{ tier: PlanTier; seats: number; periodEnd: Date | null }> {
    const [org] = await this.db.db
      .select({ plan: orgs.plan })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1);
    const [sub] = await this.db.db
      .select({ seats: subscriptions.seats, currentPeriodEnd: subscriptions.currentPeriodEnd })
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    return {
      tier: org?.plan ?? 'free',
      seats: sub ? Math.max(Math.trunc(Number(sub.seats)) || 1, 1) : 1,
      periodEnd: sub?.currentPeriodEnd ?? null,
    };
  }

  private async minutesUsed(orgId: string, start: Date, end: Date): Promise<number> {
    const [agg] = await this.db.db
      .select({ total: sql<string>`coalesce(sum(${usageEvents.quantity}), 0)` })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.orgId, orgId),
          eq(usageEvents.kind, 'live_minutes'),
          gte(usageEvents.occurredAt, start),
          lt(usageEvents.occurredAt, end),
        ),
      );
    return Math.round(Number(agg?.total ?? 0));
  }

  private async sessionAlreadyRecorded(orgId: string, sessionId: string): Promise<boolean> {
    const [existing] = await this.db.db
      .select({ id: usageEvents.id })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.orgId, orgId),
          eq(usageEvents.sessionId, sessionId),
          eq(usageEvents.kind, 'live_minutes'),
        ),
      )
      .limit(1);
    return existing !== undefined;
  }

  /** Report billable minutes to the subscription's metered overage item. */
  private async reportOverage(
    orgId: string,
    sessionId: string,
    quantity: number,
    usageEventId: string | undefined,
  ): Promise<boolean> {
    try {
      const itemId = await this.overageItemId(orgId);
      if (!itemId) {
        this.logger.warn(`No metered overage item for org ${orgId}; skipping usage report.`);
        return false;
      }
      const recordId = await this.stripe.reportOverageUsage({
        subscriptionItemId: itemId,
        quantity,
        timestampUnix: Math.floor(Date.now() / 1000),
        idempotencyKey: `usage_${sessionId}`,
      });
      if (usageEventId) {
        await this.db.db
          .update(usageEvents)
          .set({ reportedToStripeAt: new Date() })
          .where(eq(usageEvents.id, usageEventId));
      }
      this.logger.log(`Reported ${String(quantity)} overage min for org ${orgId} (${recordId}).`);
      return true;
    } catch (err) {
      // Never fail the session close on a metering hiccup; a nightly job
      // re-reports rows where reportedToStripeAt IS NULL (see unreportedIdx).
      this.logger.error(`Overage report failed for org ${orgId}`, err as Error);
      return false;
    }
  }

  /** Resolve the metered overage subscription-item id from Stripe (stateless). */
  private async overageItemId(orgId: string): Promise<string | null> {
    const [sub] = await this.db.db
      .select({ stripeSubscriptionId: subscriptions.stripeSubscriptionId })
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    if (!sub) {
      return null;
    }
    const stripeSub: Stripe.Subscription = await this.stripe.stripe.subscriptions.retrieve(
      sub.stripeSubscriptionId,
    );
    const item = stripeSub.items.data.find((i) =>
      isOveragePriceId(this.config, i.price.id),
    );
    return item?.id ?? null;
  }

  /**
   * Count of unreported overage rows — surfaced for a future reconcile job that
   * re-reports transient Stripe failures. Kept here so the query lives with the
   * ledger it reconciles.
   */
  async countUnreported(): Promise<number> {
    const [agg] = await this.db.db
      .select({ n: sql<string>`count(*)` })
      .from(usageEvents)
      .where(and(eq(usageEvents.kind, 'live_minutes'), isNull(usageEvents.reportedToStripeAt)));
    return Number(agg?.n ?? 0);
  }
}
