import { USE_CASES } from './content';

/** Compact use-case strip (server component). */
export function UseCases() {
  return (
    <section className="border-y border-white/10 bg-ink-900/40">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40">
          One overlay, many conversations
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {USE_CASES.map((uc) => (
            <div key={uc.title}>
              <h3 className="text-base font-semibold">{uc.title}</h3>
              <p className="mt-1.5 text-sm text-white/55">{uc.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
