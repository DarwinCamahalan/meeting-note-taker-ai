import Link from 'next/link';
import { SITE } from '@/lib/config/site';
import { Hero3D } from '@/components/hero/Hero3D';

/**
 * Landing hero. This Server Component holds the crawlable H1 + value-prop copy
 * and CTAs; the decorative WebGL visual is the client-only, code-split
 * {@link Hero3D} (three/@react-three loaded via `next/dynamic ssr:false`, with a
 * static poster fallback for reduced-motion / offscreen / no-WebGL clients).
 * No `three` import reaches this file, so the initial route JS stays lean
 * (docs/11-web-landing.md §4).
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient gradient wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_-10%,color-mix(in_oklch,var(--color-cue-600)_35%,transparent),transparent)]"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-cue-400" aria-hidden />
            Now in early access
          </span>
          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            {SITE.tagline}
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg text-white/70">
            {SITE.description}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/download" className="btn-primary">
              Download for free
            </Link>
            <Link href="/pricing" className="btn-secondary">
              See pricing
            </Link>
          </div>
          <p className="mt-4 text-sm text-white/40">
            macOS, Windows &amp; Linux · Free tier, no card required
          </p>
        </div>

        <Hero3D />
      </div>
    </section>
  );
}
