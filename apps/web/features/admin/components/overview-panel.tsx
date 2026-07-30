'use client';

import Link from 'next/link';
import { useAdminContext } from '../context';
import { useSeats } from '../hooks/use-seats';
import { SectionCard } from './section-card';
import { StatCard } from './stat-card';
import { LoadingNote } from './status-note';

/** Admin landing: org snapshot, seat stats, and quick links into each section. */
export function OverviewPanel(): React.JSX.Element {
  const { org, orgId } = useAdminContext();
  const { seats, entitlements, load } = useSeats(orgId);

  return (
    <div className="space-y-6">
      <SectionCard title={org.name} description={`Plan: ${org.plan} · region: ${org.dataRegion} · /${org.slug}`}>
        {!seats && load.status === 'loading' ? (
          <LoadingNote label="Loading organization…" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Seats used" value={seats ? String(seats.usedSeats) : '—'} />
            <StatCard label="Seats available" value={seats ? String(seats.availableSeats) : '—'} />
            <StatCard label="Pending invites" value={seats ? String(seats.pendingInvites) : '—'} />
            <StatCard label="Plan tier" value={entitlements ? entitlements.tier : org.plan} />
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 sm:grid-cols-3">
        <QuickLink href="/admin/members" title="Members" body="Invite teammates and manage roles." />
        <QuickLink href="/admin/sso" title="Single sign-on" body="Connect your IdP and directory." />
        <QuickLink href="/admin/billing" title="Seats & billing" body="Review seat usage and manage the plan." />
      </div>
    </div>
  );
}

function QuickLink({ href, title, body }: { href: string; title: string; body: string }): React.JSX.Element {
  return (
    <Link
      href={href}
      className="surface-card block transition hover:border-cue-400/30 hover:bg-ink-900"
    >
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-sm text-white/55">{body}</p>
    </Link>
  );
}
