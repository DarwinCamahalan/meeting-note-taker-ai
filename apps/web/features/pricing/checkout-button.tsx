'use client';

import { useCheckout, type CheckoutTier } from './hooks/use-checkout';
import type { BillingCycle } from './types';

export interface CheckoutButtonProps {
  tier: CheckoutTier;
  cycle: BillingCycle;
  label: string;
  featured?: boolean;
}

/**
 * The only client island inside a {@link TierCard}: a CTA that starts a Stripe
 * Checkout session for the given tier + billing cycle (via {@link useCheckout})
 * and redirects. Falls back to a friendly, actionable message on failure so an
 * anonymous marketing-site visitor is never left with a dead button.
 */
export function CheckoutButton({ tier, cycle, label, featured }: CheckoutButtonProps): React.JSX.Element {
  const { status, error, start } = useCheckout();
  const loading = status === 'loading';

  return (
    <>
      <button
        type="button"
        onClick={() => void start(tier, cycle)}
        disabled={loading}
        aria-busy={loading}
        className={`${featured ? 'btn-primary' : 'btn-secondary'} mt-6 w-full`}
      >
        {loading ? 'Redirecting…' : label}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-xs text-white/60">
          {error}
        </p>
      )}
    </>
  );
}
