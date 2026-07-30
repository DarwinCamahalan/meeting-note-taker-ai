'use client';

import type { AdminMemberView, Role } from '@cue/types';
import { useAdminContext } from '../context';
import { useMembers } from '../hooks/use-members';
import { useInvites } from '../hooks/use-invites';
import { formatDate } from '../utils/format';
import { SectionCard } from './section-card';
import { InviteForm } from './invite-form';
import { MemberRow } from './member-row';
import { RoleBadge } from './role-badge';
import { EmptyNote, ErrorNote, LoadingNote, StatusBadge } from './status-note';

/** Members management: invite, list, change roles, remove; plus pending invites. */
export function MembersPanel(): React.JSX.Element {
  const { orgId, role: actorRole, user } = useAdminContext();
  const members = useMembers(orgId);
  const invites = useInvites(orgId);

  const busy = members.mutation.status === 'loading';

  const onRoleChange = (userId: string, role: Role): void => {
    void members.updateRole(userId, role);
  };

  const onRemove = (member: AdminMemberView): void => {
    const label = member.displayName ?? member.email;
    if (window.confirm(`Remove ${label} from the organization?`)) {
      void members.removeMember(member.userId);
    }
  };

  const pending = invites.invites.filter((i) => i.status === 'pending');

  return (
    <div className="space-y-6">
      <SectionCard title="Invite a teammate" description="They'll get an email to join this organization.">
        <InviteForm actorRole={actorRole} mutation={invites.mutation} onInvite={invites.createInvite} />
        {invites.mutation.error && (
          <div className="mt-3">
            <ErrorNote message={invites.mutation.error} />
          </div>
        )}
      </SectionCard>

      <SectionCard title="Members" description="Everyone with access to this organization.">
        {members.load.error && <ErrorNote message={members.load.error} />}
        {members.mutation.error && (
          <div className="mb-3">
            <ErrorNote message={members.mutation.error} />
          </div>
        )}

        {members.members.length === 0 && members.load.status === 'loading' ? (
          <LoadingNote label="Loading members…" />
        ) : members.members.length === 0 ? (
          <EmptyNote>No members yet.</EmptyNote>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="text-xs uppercase tracking-widest text-white/35">
                  <th className="pb-2 pr-4 font-medium">Member</th>
                  <th className="pb-2 pr-4 font-medium">Role</th>
                  <th className="pb-2 pr-4 font-medium">Auth</th>
                  <th className="pb-2 pr-4 font-medium">Last active</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {members.members.map((member) => (
                  <MemberRow
                    key={member.userId}
                    member={member}
                    actorRole={actorRole}
                    isSelf={member.userId === user.id}
                    busy={busy}
                    onRoleChange={onRoleChange}
                    onRemove={onRemove}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {members.hasMore && (
          <button
            type="button"
            onClick={() => void members.loadMore()}
            disabled={members.load.status === 'loading'}
            className="btn-secondary mt-4 !px-4 !py-2"
          >
            {members.load.status === 'loading' ? 'Loading…' : 'Load more'}
          </button>
        )}
      </SectionCard>

      <SectionCard title="Pending invitations" description="Invites that haven't been accepted yet.">
        {invites.load.error && <ErrorNote message={invites.load.error} />}
        {pending.length === 0 ? (
          <EmptyNote>No pending invitations.</EmptyNote>
        ) : (
          <ul className="divide-y divide-white/5">
            {pending.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm text-white/85">{invite.email}</p>
                  <p className="text-xs text-white/40">
                    Invited {formatDate(invite.createdAt)} · expires {formatDate(invite.expiresAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <RoleBadge role={invite.role} />
                  <StatusBadge tone="pending">Pending</StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
