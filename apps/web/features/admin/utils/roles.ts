/**
 * RBAC helpers for the admin console UI. Roles mirror the `@cue/types` {@link Role}
 * subset (owner/admin/member) the server `@RequireRole` guard evaluates — the UI
 * only *reflects* those rules; the server remains the source of truth.
 */
import type { OrgRole, Role } from '@cue/types';

/** Roles that can enter the admin console. */
export const PRIVILEGED_ROLES: readonly Role[] = ['owner', 'admin'];

/** All RBAC-assignable roles, most-privileged first. */
export const ASSIGNABLE_ROLES: readonly Role[] = ['owner', 'admin', 'member'];

/** Human label for a role. */
export function roleLabel(role: Role): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'member':
      return 'Member';
    default:
      return role;
  }
}

/** Narrow an {@link OrgRole} list to the highest RBAC role held, if any. */
export function highestRole(roles: readonly OrgRole[]): Role | null {
  for (const candidate of ASSIGNABLE_ROLES) {
    if (roles.includes(candidate)) return candidate;
  }
  return null;
}

/** True when the actor may manage members / settings at all. */
export function isPrivileged(role: Role | null): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Roles the actor is allowed to *assign*. Owners may grant any role; admins may
 * grant admin/member but never owner (owner transfer is an owner-only action).
 */
export function assignableRolesFor(actor: Role | null): Role[] {
  if (actor === 'owner') return ['owner', 'admin', 'member'];
  if (actor === 'admin') return ['admin', 'member'];
  return [];
}

/**
 * Whether `actor` may modify (role-change or remove) a member currently holding
 * `target`. Admins cannot touch owners; nobody may act via this UI on themselves
 * for role/removal (guarded separately by `isSelf`).
 */
export function canManageTarget(actor: Role | null, target: Role): boolean {
  if (actor === 'owner') return true;
  if (actor === 'admin') return target !== 'owner';
  return false;
}
