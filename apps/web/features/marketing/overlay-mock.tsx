/**
 * Decorative "private overlay floating over a blurred meeting" visual — the
 * static, dependency-free stand-in for the Phase 2 R3F hero. `aria-hidden`
 * because the real headline/value-prop copy lives in the DOM beside it.
 */
export function OverlayMock() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md">
      {/* Blurred "meeting" plane behind the overlay */}
      <div className="absolute inset-0 -z-10 translate-y-6 scale-95 rounded-2xl bg-gradient-to-br from-ink-800 to-ink-900 blur-sm" />
      <div className="absolute right-6 top-4 -z-10 h-24 w-24 rounded-full bg-cue-500/30 blur-2xl" />

      <div className="surface-card animate-[float_6s_ease-in-out_infinite] shadow-2xl shadow-black/40">
        <div className="flex items-center gap-2 text-xs text-white/50">
          <span className="h-2 w-2 rounded-full bg-cue-400" />
          Listening · they said
        </div>
        <p className="mt-3 text-sm text-white/80">
          &ldquo;Walk me through a time you handled a production incident.&rdquo;
        </p>

        <div className="mt-5 rounded-xl border border-cue-500/30 bg-cue-500/10 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-cue-200">
            <SparkGlyph />
            Cue
          </div>
          <p className="mt-2 text-sm leading-relaxed text-white/90">
            Lead with the STAR structure: the outage scope, your triage steps,
            the fix, and what you changed afterward to prevent a repeat.
          </p>
        </div>
      </div>

      {/* keyframes are scoped inline to keep the visual self-contained */}
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
    </div>
  );
}

function SparkGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2v6m0 8v6m10-10h-6M8 12H2m15.07-7.07l-4.24 4.24m-1.66 1.66l-4.24 4.24m12.14 0l-4.24-4.24m-1.66-1.66L6.93 4.93"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
