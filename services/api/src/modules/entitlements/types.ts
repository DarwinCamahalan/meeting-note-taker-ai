/**
 * Internal shapes for how the `entitlements` table is projected. The real
 * @cue/db `entitlements` schema is `(orgId, feature, limits jsonb)` with a
 * unique `(orgId, feature)`; we persist ONE denormalized snapshot row per org
 * so the resolved feature-gate map is the runtime source of truth and upserts
 * are trivially idempotent (one row, one conflict target).
 *
 * TODO(schema): when @cue/db grows dedicated `tier`/`version`/`status` columns
 * on `entitlements`, migrate off the sentinel-feature snapshot row.
 */
import type { Entitlement, PlanTier, SubscriptionStatus } from '@cue/types';

/** The sentinel `feature` value the resolved snapshot is stored under. */
export const ENTITLEMENTS_SNAPSHOT_FEATURE = 'resolved' as const;

/**
 * The JSON payload stored in `entitlements.limits` for the snapshot row. Holds
 * everything `GET /v1/me/entitlements` needs except the live `remaining` quota,
 * which is overlaid from usage at read time.
 */
export interface EntitlementsSnapshot {
  tier: PlanTier;
  status: SubscriptionStatus;
  version: number;
  /** Per-key resolved gates (without live `remaining`). */
  entitlements: Entitlement[];
}
