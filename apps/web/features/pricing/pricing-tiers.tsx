'use client';

import { useState } from 'react';
import { PRICING_TIERS } from './plans';
import { TierCard } from './tier-card';
import type { BillingCycle } from './types';

/** Billing-cycle toggle + tier grid (the only client island on /pricing). */
export function PricingTiers() {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  return (
    <div>
      <div className="flex justify-center">
        <div
          role="tablist"
          aria-label="Billing cycle"
          className="inline-flex rounded-full border border-white/15 bg-white/5 p-1 text-sm"
        >
          {(['monthly', 'annual'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={cycle === option}
              onClick={() => setCycle(option)}
              className={
                cycle === option
                  ? 'rounded-full bg-cue-500 px-4 py-1.5 font-semibold text-white'
                  : 'rounded-full px-4 py-1.5 text-white/60 transition hover:text-white'
              }
            >
              {option === 'monthly' ? 'Monthly' : 'Annual'}
              {option === 'annual' && (
                <span className="ml-1.5 text-xs text-cue-200">2 months free</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-4">
        {PRICING_TIERS.map((tier) => (
          <TierCard key={tier.id} tier={tier} cycle={cycle} />
        ))}
      </div>
    </div>
  );
}
