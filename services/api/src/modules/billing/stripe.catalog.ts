/**
 * Stripe product/price catalog — the single place that maps Cue {@link PlanTier}
 * to configured Stripe Price ids and back (51-payments-stripe.md §2). Price ids
 * come from env ONLY; feature logic never hard-codes them.
 *
 * v1 wires one licensed Price per self-serve tier (Pro/Team) plus one metered
 * overage Price attached as a second subscription item. Annual Prices are a
 * later addition (see TODO) — `interval` is accepted on the request but the
 * configured Price is used regardless in v1.
 */
import type { AppConfig } from '../../config/app-config.js';

/** Canonical overage rate, locked at $0.13 per live minute (51 §2, decision F-01). */
export const OVERAGE_RATE_USD = 0.13;

/** The self-serve, Checkout-eligible tiers (Free/Enterprise are not self-serve). */
export type SelfServeTier = 'pro' | 'team';

/** Resolved, validated set of Stripe ids needed to build a Checkout session. */
export interface CheckoutPriceSet {
  /** The licensed base Price id for the tier. */
  basePriceId: string;
  /** The metered overage Price id (attached as a second subscription item). */
  overagePriceId: string;
  /** Whether the tier is per-seat (Team) — drives `quantity` on the base item. */
  perSeat: boolean;
}

/** Thrown when a required Stripe env key is missing at call time (fail-loud). */
export class StripeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeConfigError';
  }
}

/** Resolve + validate the price set for a self-serve tier from config. */
export function checkoutPriceSet(config: AppConfig, tier: SelfServeTier): CheckoutPriceSet {
  const basePriceId = tier === 'pro' ? config.stripePricePro : config.stripePriceTeam;
  const overagePriceId = config.stripePriceOverage;
  if (!basePriceId) {
    throw new StripeConfigError(
      `Missing Stripe price for tier "${tier}" (set STRIPE_PRICE_${tier.toUpperCase()}).`,
    );
  }
  if (!overagePriceId) {
    throw new StripeConfigError('Missing STRIPE_PRICE_OVERAGE (metered overage price).');
  }
  return { basePriceId, overagePriceId, perSeat: tier === 'team' };
}

/**
 * Reverse map: a licensed base Price id -> its tier. Used by the webhook
 * reconciler to derive the tier from a subscription's items order-independently.
 * The metered overage price is intentionally excluded (it is not a base tier).
 */
export function tierForPriceId(config: AppConfig, priceId: string): SelfServeTier | null {
  if (config.stripePricePro && priceId === config.stripePricePro) {
    return 'pro';
  }
  if (config.stripePriceTeam && priceId === config.stripePriceTeam) {
    return 'team';
  }
  return null;
}

/** True when `priceId` is the configured metered-overage price. */
export function isOveragePriceId(config: AppConfig, priceId: string): boolean {
  return config.stripePriceOverage !== undefined && priceId === config.stripePriceOverage;
}
