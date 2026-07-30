'use client';

import type { AdminMemberView, Role } from '@cue/types';
import { assignableRolesFor, canManageTarget, roleLabel } from '../utils/roles';
import { formatRelative, initials } from '../utils/format';
import { RoleBadge } from './role-badge';
import { StatusBadge } from './status-note';

/**
 * One member row with an inline role selector and a remove control. Both are
 * disabled when the actor lacks authority over the target (RBAC) or the row is
 * the actor's own membership.
 */
export function MemberRow({
  member,
  actorRole,
  isSelf,
  busy,
  onRoleChange,
  onRemove,
}: {
  member: AdminMemberView;
  actorRole: Role;
  isSelf: boolean;
  busy: boolean;
  onRoleChange: (userId: string, role: Role) => void;
  onRemove: (member: AdminMemberView) => void;
}): React.JSX.Element {
  const manageable = !isSelf && canManageTarget(actorRole, member.role);
  const roleOptions = assignableRolesFor(actorRole);

  return (
    <tr className="border-t border-white/5">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-xs font-semibold text-white/70"
          >
            {initials(member.displayName, member.email)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm text-white/90">{member.displayName ?? member.email}</p>
            <p className="truncate text-xs text-white/40">{member.email}</p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4">
        {manageable ? (
          <select
            aria-label={`Role for ${member.email}`}
            value={member.role}
            disabled={busy}
            onChange={(e) => onRoleChange(member.userId, e.target.value as Role)}
            className="rounded-lg border border-white/10 bg-ink-950 px-2 py-1 text-sm text-white outline-none focus:border-cue-400 disabled:opacity-50"
          >
            {/* Ensure the current role is always selectable even if outside the actor's grant set. */}
            {(roleOptions.includes(member.role) ? roleOptions : [member.role, ...roleOptions]).map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        ) : (
          <RoleBadge role={member.role} />
        )}
      </td>
      <td className="py-3 pr-4">
        {member.ssoLinked ? <StatusBadge tone="active">SSO</StatusBadge> : <StatusBadge tone="muted">Password</StatusBadge>}
      </td>
      <td className="py-3 pr-4 text-xs text-white/50">{formatRelative(member.lastActiveAt)}</td>
      <td className="py-3 text-right">
        {manageable && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRemove(member)}
            className="text-xs font-medium text-red-300 transition hover:text-red-200 disabled:opacity-50"
          >
            Remove
          </button>
        )}
        {isSelf && <span className="text-xs text-white/30">You</span>}
      </td>
    </tr>
  );
}
