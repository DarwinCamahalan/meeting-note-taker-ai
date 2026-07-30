/**
 * EntitlementsService — the runtime source of truth for feature gates. It reads
 * and writes the denormalized snapshot row in the `entitlements` table, and is
 * the ONLY writer used by both the billing-webhooks reconciler (billing state ->
 * capability) and any manual grant path.
 *
 *   resolve(orgId)          -> EntitlementsResponse (with live quota remainders)
 *   can(orgId, key)         -> boolean gate check (used by RequireEntitlementGuard)
 *   reconcile(orgId, tier)  -> persist a fresh snapshot, bumping `version`
 */
import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { entitlements, orgs, subscriptions, usageEvents } from '@cue/db';
import type { NewEntitlement } from '@cue/db';
import type {
  Entitlement,
  EntitlementKey,
  EntitlementsResponse,
  PlanTier,
  SubscriptionStatus,
} from '@cue/types';
import { currentBillingPeriod } from '../../common/billing-period.js';
import { DbService } from '../../database/db.service.js';
import { buildEntitlements, liveMinutesLimit } from './entitlements.catalog.js';
import {
  ENTITLEMENTS_SNAPSHOT_FEATURE,
  type EntitlementsSnapshot,
} from './types.js';

const LIVE_MINUTES_QUOTA_KEY: EntitlementKey = 'live.minutes.quota';

@Injectable()
export class EntitlementsService {
  constructor(private readonly db: DbService) {}

  /**
   * Resolve the effective snapshot for an org, overlaying live quota remainders
   * from the current billing period's usage ledger. Auto-provisions a snapshot
   * from the org's plan on first read (idempotent).
   */
  async resolve(orgId: string): Promise<EntitlementsResponse> {
    const snapshot = await this.loadOrProvision(orgId);
    const periodEnd = await this.periodAnchor(orgId);
    const usedMinutes = await this.liveMinutesUsed(orgId, periodEnd);

    const resolved = snapshot.entitlements.map((e) =>
      this.overlayRemaining(e, usedMinutes),
    );

    return {
      orgId,
      tier: snapshot.tier,
      version: snapshot.version,
      entitlements: resolved,
    };
  }

  /** Boolean gate check for the `@RequireEntitlement` guard. */
  async can(orgId: string, key: EntitlementKey): Promise<boolean> {
    const snapshot = await this.loadOrProvision(orgId);
    return snapshot.entitlements.find((e) => e.key === key)?.enabled ?? false;
  }

  /**
   * Persist a fresh entitlement snapshot for `tier`/`status`, bumping `version`.
   * Idempotent by construction: it rebuilds the full gate map from the tier
   * template and upserts the single `(orgId, 'resolved')` row, so replaying the
   * same billing event converges to the same gates (version increments, which
   * is monotonic and harmless).
   */
  async reconcile(
    orgId: string,
    tier: PlanTier,
    status: SubscriptionStatus = 'active',
  ): Promise<EntitlementsSnapshot> {
    const previous = await this.loadSnapshot(orgId);
    const snapshot: EntitlementsSnapshot = {
      tier,
      status,
      version: (previous?.version ?? 0) + 1,
      entitlements: buildEntitlements(tier),
    };

    const row: NewEntitlement = {
      orgId,
      feature: ENTITLEMENTS_SNAPSHOT_FEATURE,
      limits: snapshot,
      updatedAt: new Date(),
    };

    await this.db.db
      .insert(entitlements)
      .values(row)
      .onConflictDoUpdate({
        target: [entitlements.orgId, entitlements.feature],
        set: { limits: snapshot, updatedAt: new Date() },
      });

    return snapshot;
  }

  /* ----------------------------- internals ----------------------------- */

  private async loadOrProvision(orgId: string): Promise<EntitlementsSnapshot> {
    const existing = await this.loadSnapshot(orgId);
    if (existing) {
      return existing;
    }
    const tier = await this.orgTier(orgId);
    return this.reconcile(orgId, tier, 'active');
  }

  private async loadSnapshot(orgId: string): Promise<EntitlementsSnapshot | null> {
    const [row] = await this.db.db
      .select({ limits: entitlements.limits })
      .from(entitlements)
      .where(
        and(
          eq(entitlements.orgId, orgId),
          eq(entitlements.feature, ENTITLEMENTS_SNAPSHOT_FEATURE),
        ),
      )
      .limit(1);
    if (!row) {
      return null;
    }
    return row.limits as EntitlementsSnapshot;
  }

  private async orgTier(orgId: string): Promise<PlanTier> {
    const [org] = await this.db.db
      .select({ plan: orgs.plan })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1);
    return org?.plan ?? 'free';
  }

  /** The subscription's `current_period_end`, when one exists, else null. */
  private async periodAnchor(orgId: string): Promise<Date | null> {
    const [sub] = await this.db.db
      .select({ currentPeriodEnd: subscriptions.currentPeriodEnd })
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    return sub?.currentPeriodEnd ?? null;
  }

  /** Sum of whole live minutes consumed this billing period. */
  private async liveMinutesUsed(orgId: string, periodEnd: Date | null): Promise<number> {
    const period = currentBillingPeriod(new Date(), periodEnd);
    const [agg] = await this.db.db
      .select({ total: sql<string>`coalesce(sum(${usageEvents.quantity}), 0)` })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.orgId, orgId),
          eq(usageEvents.kind, 'live_minutes'),
          gte(usageEvents.occurredAt, period.start),
          lt(usageEvents.occurredAt, period.end),
        ),
      );
    return Math.round(Number(agg?.total ?? 0));
  }

  private overlayRemaining(entitlement: Entitlement, usedMinutes: number): Entitlement {
    if (entitlement.key !== LIVE_MINUTES_QUOTA_KEY || entitlement.limit === null) {
      return entitlement;
    }
    return {
      ...entitlement,
      remaining: Math.max(entitlement.limit - usedMinutes, 0),
    };
  }
}

/** Re-exported so callers importing the service also get the tier helper. */
export { liveMinutesLimit };
