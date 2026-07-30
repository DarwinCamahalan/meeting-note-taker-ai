import Link from 'next/link';
import type { BillingCycle, PricingTier } from './types';

function formatPrice(tier: PricingTier, cycle: BillingCycle): string {
  const value = cycle === 'monthly' ? tier.monthly : tier.annual;
  if (value === null) return 'Custom';
  return `$${value}`;
}

function priceSuffix(tier: PricingTier, cycle: BillingCycle): string {
  if (tier.monthly === null) return '';
  const per = tier.perSeat ? '/seat' : '';
  return cycle === 'monthly' ? `${per}/mo` : `${per}/yr`;
}

/** One pricing tier card (presentational; server-renderable). */
export function TierCard({ tier, cycle }: { tier: PricingTier; cycle: BillingCycle }) {
  const isExternal = tier.cta.href.startsWith('mailto:');
  return (
    <article
      className={
        tier.featured
          ? 'surface-card relative ring-2 ring-cue-500'
          : 'surface-card relative'
      }
    >
      {tier.featured && (
        <span className="absolute -top-3 left-6 rounded-full bg-cue-500 px-3 py-1 text-xs font-semibold text-white">
          Most popular
        </span>
      )}
      <h3 className="text-lg font-semibold">{tier.name}</h3>
      <p className="mt-1 text-sm text-white/55">{tier.tagline}</p>

      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-4xl font-semibold tracking-tight">
          {formatPrice(tier, cycle)}
        </span>
        <span className="text-sm text-white/50">{priceSuffix(tier, cycle)}</span>
      </div>

      {isExternal ? (
        <a href={tier.cta.href} className="btn-secondary mt-6 w-full">
          {tier.cta.label}
        </a>
      ) : (
        <Link
          href={tier.cta.href}
          className={tier.featured ? 'btn-primary mt-6 w-full' : 'btn-secondary mt-6 w-full'}
        >
          {tier.cta.label}
        </Link>
      )}

      <ul className="mt-6 space-y-3 text-sm text-white/70">
        {tier.features.map((feature) => (
          <li key={feature} className="flex gap-2.5">
            <CheckGlyph />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function CheckGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className="mt-0.5 shrink-0 text-cue-300"
      aria-hidden
    >
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
