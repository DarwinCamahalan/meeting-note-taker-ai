/** Inline status notes shared across panels: error, empty, and loading rows. */

export function ErrorNote({ message }: { message: string }): React.JSX.Element {
  return (
    <p role="alert" className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-200">
      {message}
    </p>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-white/10 bg-ink-950/40 px-4 py-8 text-center text-sm text-white/45">
      {children}
    </div>
  );
}

export function LoadingNote({ label = 'Loading…' }: { label?: string }): React.JSX.Element {
  return <p className="text-sm text-white/45">{label}</p>;
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: 'active' | 'pending' | 'muted';
  children: React.ReactNode;
}): React.JSX.Element {
  const cls =
    tone === 'active'
      ? 'border-cue-400/30 bg-cue-500/15 text-cue-100'
      : tone === 'pending'
        ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
        : 'border-white/15 bg-white/5 text-white/60';
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}
