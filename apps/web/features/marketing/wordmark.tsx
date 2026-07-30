import { SITE } from '@/lib/config/site';

/** Small brand wordmark with a gradient dot. */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
      <span
        aria-hidden
        className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-cue-300 to-cue-600 shadow-[0_0_12px] shadow-cue-500/60"
      />
      {SITE.name}
    </span>
  );
}
