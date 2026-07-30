'use client';

import { useCallback, useState } from 'react';
import { CueApiClient, CueApiError } from '@cue/sdk';
import type { BillingInterval, CheckoutSessionRequest } from '@cue/types';
import { apiBaseUrl, siteUrl } from '@/lib/config/site';
import type { BillingCycle } from '../types';

/** Self-serve tiers that can start a Checkout session (Free/Enterprise cannot). */
export type CheckoutTier = CheckoutSessionRequest['tier'];

export type CheckoutStatus = 'idle' | 'loading' | 'error';

export interface UseCheckout {
  status: CheckoutStatus;
  /** Human-readable failure message when `status === 'error'`. */
  error: string | null;
  /** Start Checkout for a tier + billing cycle and redirect to Stripe. */
  start: (tier: CheckoutTier, cycle: BillingCycle) => Promise<void>;
}

function intervalFor(cycle: BillingCycle): BillingInterval {
  return cycle === 'annual' ? 'year' : 'month';
}

function messageFor(err: unknown): string {
  if (err instanceof CueApiError && (err.status === 401 || err.status === 403)) {
    return 'Please sign in from the Cue app to upgrade your plan.';
  }
  return 'We could not start checkout. Please try again or download the app to upgrade.';
}

/**
 * Client-side Stripe Checkout launcher for the pricing CTAs. Builds a
 * {@link CueApiClient} against the public `api` base URL, calls
 * `billing.createCheckout`, and redirects the browser to Stripe's hosted page.
 *
 * The marketing site is unauthenticated, so Checkout typically requires a signed
 * session; a 401/403 is surfaced as a "sign in from the app" message rather than
 * a hard failure, keeping the CTA graceful for anonymous visitors.
 */
export function useCheckout(): UseCheckout {
  const [status, setStatus] = useState<CheckoutStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (tier: CheckoutTier, cycle: BillingCycle): Promise<void> => {
    setStatus('loading');
    setError(null);
    try {
      const client = new CueApiClient({ baseUrl: apiBaseUrl() });
      const origin = siteUrl();
      const { url } = await client.billing.createCheckout({
        tier,
        interval: intervalFor(cycle),
        successUrl: `${origin}/download?checkout=success`,
        cancelUrl: `${origin}/pricing?checkout=cancelled`,
      });
      // Full-page navigation off-site to Stripe's hosted Checkout.
      window.location.assign(url);
    } catch (err) {
      setStatus('error');
      setError(messageFor(err));
    }
  }, []);

  return { status, error, start };
}
