/**
 * Row -> wire-DTO mappers for the OrgsModule. Keeps serialization (and the
 * `Date -> ISO-8601` + role-narrowing conversions) out of the services. The
 * invite's raw `token` is never mapped onto the wire — {@link OrgInvite} has no
 * token field by design.
 */
import type { Invitation as InvitationRow } from '@cue/db';
import type { AdminMemberView, InviteStatus, OrgInvite, Role } from '@cue/types';
import { toRbacRole } from '../rbac/rbac.util.js';

/** A member's `org_members` row joined to its `users` identity. */
export interface MemberJoin {
  userId: string;
  orgId: string;
  role: string;
  joinedAt: Date;
  email: string;
  displayName: string | null;
  lastActiveAt: Date | null;
}

export function toOrgInviteDto(row: InvitationRow): OrgInvite {
  return {
    id: row.id,
    orgId: row.orgId,
    email: row.email,
    role: narrowRole(row.role),
    status: row.status as InviteStatus,
    invitedBy: row.invitedBy,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAdminMemberView(join: MemberJoin, ssoLinked: boolean): AdminMemberView {
  return {
    userId: join.userId,
    orgId: join.orgId,
    email: join.email,
    displayName: join.displayName,
    role: narrowRole(join.role),
    joinedAt: join.joinedAt.toISOString(),
    lastActiveAt: join.lastActiveAt ? join.lastActiveAt.toISOString() : null,
    ssoLinked,
  };
}

/** Narrow a stored `org_role` to the RBAC subset; the billing pseudo-role reads as 'member'. */
function narrowRole(role: string): Role {
  return toRbacRole(role) ?? 'member';
}
