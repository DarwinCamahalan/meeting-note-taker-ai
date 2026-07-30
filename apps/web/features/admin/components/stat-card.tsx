/** Compact metric tile for the overview + billing panels. */
export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-950/40 px-4 py-3">
      <p className="text-xs uppercase tracking-widest text-white/40">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-white/40">{hint}</p>}
    </div>
  );
}
