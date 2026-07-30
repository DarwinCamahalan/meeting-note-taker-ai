/**
 * Internal usage-domain shapes. The public wire DTO is `UsageSummary` from
 * @cue/types; these are the intermediate results the service computes.
 */
import type { PlanTier, UsageEnforcementState } from '@cue/types';

/** Sentinel for an unlimited (Enterprise/custom) allotment on the numeric DTO. */
export const UNLIMITED_MINUTES = Number.MAX_SAFE_INTEGER;

/** 80% soft-warn threshold (50 §6.3 enforcement ladder). */
export const SOFT_WARN_RATIO = 0.8;

/** The resolved metering picture for an org's current billing period. */
export interface UsageComputation {
  tier: PlanTier;
  periodStart: Date;
  periodEnd: Date;
  used: number;
  included: number;
  remaining: number;
  overageMinutes: number;
  overageAllowed: boolean;
  state: UsageEnforcementState;
}

/** Result of recording a session's live minutes (drives client meter + toasts). */
export interface RecordLiveMinutesResult {
  state: UsageEnforcementState;
  /** Whole minutes from THIS session that fell beyond the allotment. */
  billableMinutes: number;
  /** True when those billable minutes were reported to Stripe. */
  reportedToStripe: boolean;
}
