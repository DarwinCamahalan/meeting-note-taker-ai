/**
 * Billing contract: the Stripe Checkout request schema (the only client-supplied
 * billing body). Portal + usage + entitlements are read-only or bodyless, so
 * their responses are validated by the compile-time drift guards below rather
 * than a runtime pipe.
 */
import { z } from 'zod';
import type {
  CheckoutSessionRequest,
  CheckoutSessionResponse,
  Entitlement,
  EntitlementsResponse,
  PortalLinkResponse,
  UsageSummary,
} from '@cue/types';
import type { Assert, Equal, StripUndef } from './type-utils.js';

/** Self-serve tiers only — Free/Enterprise are excluded from Checkout. */
export const CheckoutTierSchema = z.enum(['pro', 'team']);
export const BillingIntervalSchema = z.enum(['month', 'year']);

export const CheckoutSessionRequestSchema = z
  .object({
    tier: CheckoutTierSchema,
    interval: BillingIntervalSchema,
    seats: z.coerce.number().int().min(1).max(1000).optional(),
    /** Absolute URLs Stripe redirects to; server default when omitted. */
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
  })
  .strict();

export type CheckoutSessionRequestDto = z.infer<typeof CheckoutSessionRequestSchema>;

/* ---- compile-time drift guards against @cue/types ---- */
export type _CheckoutReq = Assert<
  Equal<StripUndef<CheckoutSessionRequestDto>, StripUndef<CheckoutSessionRequest>>
>;

// Response DTOs are produced (not parsed) by the api; assert we build the exact
// @cue/types shape so the SDK never drifts. `never` alias = pure type check.
type _CheckoutRes = CheckoutSessionResponse;
type _PortalRes = PortalLinkResponse;
type _Usage = UsageSummary;
type _EntRes = EntitlementsResponse;
type _Ent = Entitlement;
export type _BillingResponses = [_CheckoutRes, _PortalRes, _Usage, _EntRes, _Ent];
