import type { SeatSummary } from '@cue/types';

/** Horizontal used/purchased seat bar with a pending-invite overlay segment. */
export function SeatMeter({ seats }: { seats: SeatSummary }): React.JSX.Element {
  const purchased = Math.max(seats.purchasedSeats, seats.usedSeats + seats.pendingInvites, 1);
  const usedPct = Math.min(100, (seats.usedSeats / purchased) * 100);
  const pendingPct = Math.min(100 - usedPct, (seats.pendingInvites / purchased) * 100);

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/5">
        <span className="h-full bg-cue-500" style={{ width: `${String(usedPct)}%` }} aria-hidden />
        <span className="h-full bg-amber-400/60" style={{ width: `${String(pendingPct)}%` }} aria-hidden />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-cue-500 align-middle" />
          {seats.usedSeats} used
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400/60 align-middle" />
          {seats.pendingInvites} pending
        </span>
        <span>{seats.availableSeats} available of {seats.purchasedSeats} purchased</span>
      </div>
    </div>
  );
}
