import type { Plan } from '@cue/types';

export type BillingCycle = 'monthly' | 'annual';

export interface PricingTier {
  /** Maps 1:1 to the `@cue/types` Plan union (billing source of truth). */
  id: Plan;
  name: string;
  /** Monthly price in USD; null = custom (contact sales). */
  monthly: number | null;
  /** Annual price in USD per the "2 months free" rule; null = custom. */
  annual: number | null;
  /** Per-seat pricing (Team) vs. per-account. */
  perSeat: boolean;
  tagline: string;
  /** Feature bullets shown on the card. */
  features: string[];
  cta: { label: string; href: string };
  featured?: boolean;
}
