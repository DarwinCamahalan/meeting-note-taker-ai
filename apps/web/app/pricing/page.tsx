import type { Metadata } from 'next';
import { PricingTiers } from '@/features/pricing/pricing-tiers';
import { SiteFooter } from '@/features/marketing/site-footer';
import { SiteNav } from '@/features/marketing/site-nav';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildMetadata({
  title: 'Pricing',
  description:
    'Simple plans for AssistMe: Free to start, Pro at $20/mo, Team at $30/seat, and Enterprise. Live minutes, model access, and RAG uploads per tier.',
  path: '/pricing',
});

/** Pricing page — thin orchestration around the pricing feature. */
export default function PricingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Pricing that scales with your calls
            </h1>
            <p className="mt-4 text-lg text-white/60">
              Start free. Upgrade when you need more live minutes, stronger
              models, and your own documents in context.
            </p>
          </div>
          <div className="mt-14">
            <PricingTiers />
          </div>
          <p className="mt-10 text-center text-sm text-white/40">
            Prices in USD. Pro &amp; Team start secure Stripe Checkout; sign in
            from the app if prompted.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
