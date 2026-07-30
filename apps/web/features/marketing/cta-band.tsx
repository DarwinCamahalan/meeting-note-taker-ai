import Link from 'next/link';

/** Closing call-to-action band (server component). */
export function CtaBand() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cue-700/40 via-ink-900 to-ink-950 p-10 text-center sm:p-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_0%,color-mix(in_oklch,var(--color-cue-500)_30%,transparent),transparent)]"
        />
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Bring Cue to your next call
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/70">
          Download, sign in, and you&rsquo;re listening in under a minute. Free
          to start — upgrade when you need more live minutes.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/download" className="btn-primary">
            Download for free
          </Link>
          <Link href="/pricing" className="btn-secondary">
            Compare plans
          </Link>
        </div>
      </div>
    </section>
  );
}
