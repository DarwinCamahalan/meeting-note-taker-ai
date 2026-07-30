import type { ValueProp } from './content';
import { VALUE_PROPS } from './content';

/** Feature grid of the four core value props (server component). */
export function ValueProps() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-20">
      <div className="max-w-2xl">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Built to help you show up at your best
        </h2>
        <p className="mt-4 text-lg text-white/60">
          AssistMe runs as an invisible overlay, listens with you, and offers
          grounded suggestions — never in the way, never on the screen share.
        </p>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {VALUE_PROPS.map((prop) => (
          <article key={prop.title} className="surface-card">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cue-500/15 text-cue-200">
              <PropIcon icon={prop.icon} />
            </div>
            <h3 className="mt-4 text-base font-semibold">{prop.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/60">{prop.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function PropIcon({ icon }: { icon: ValueProp['icon'] }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (icon) {
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case 'waveform':
      return (
        <svg {...common}>
          <path d="M4 12h2M8 8v8M12 5v14M16 8v8M20 12h-2" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...common}>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" />
        </svg>
      );
    case 'docs':
      return (
        <svg {...common}>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v4h4M9 12h7M9 16h7" />
        </svg>
      );
  }
}
