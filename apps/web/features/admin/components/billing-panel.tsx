'use client';

import { useAdminContext } from '../context';
import { useSeats } from '../hooks/use-seats';
import { SectionCard } from './section-card';
import { SeatMeter } from './seat-meter';
import { StatCard } from './stat-card';
import { ErrorNote, LoadingNote } from './status-note';

/** Seats & billing: seat accounting + Stripe Customer Portal link for the org. */
export function BillingPanel(): React.JSX.Element {
  const { orgId } = useAdminContext();
  const { seats, entitlements, load, portal, openBillingPortal } = useSeats(orgId);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Team seats"
        description="Per-seat billing follows your active members. Adjust the subscription in Stripe."
        actions={
          <button
            type="button"
            onClick={() => void openBillingPortal()}
            disabled={portal.status === 'loading'}
            className="btn-primary !px-4 !py-2"
          >
            {portal.status === 'loading' ? 'Opening…' : 'Manage billing'}
          </button>
        }
      >
        {load.error && <ErrorNote message={load.error} />}
        {portal.error && (
          <div className="mb-3">
            <ErrorNote message={portal.error} />
          </div>
        )}

        {!seats && load.status === 'loading' ? (
          <LoadingNote label="Loading seat usage…" />
        ) : seats ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-4">
              <StatCard label="Purchased" value={String(seats.purchasedSeats)} />
              <StatCard label="Used" value={String(seats.usedSeats)} />
              <StatCard label="Available" value={String(seats.availableSeats)} />
              <StatCard label="Pending invites" value={String(seats.pendingInvites)} />
            </div>
            <SeatMeter seats={seats} />
          </div>
        ) : null}
      </SectionCard>

      {entitlements && (
        <SectionCard title="Plan" description={`Current tier: ${entitlements.tier}.`}>
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {entitlements.entitlements.map((ent) => (
              <li key={ent.key} className="flex items-center justify-between border-b border-white/5 py-2 text-sm">
                <span className="text-white/70">{ent.key}</span>
                <span className={ent.enabled ? 'text-cue-200' : 'text-white/30'}>
                  {ent.enabled ? (ent.limit != null ? `${String(ent.limit)} ${ent.unit ?? ''}`.trim() : 'On') : 'Off'}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
