/**
 * RBAC role helpers used by the OrgsModule / AdminModule business logic (role
 * narrowing + hierarchy comparisons for member-management rules). The guard
 * itself gates on the explicit role set in {@link RbacRequirement} and the
 * capability table in `rbac.permissions.ts`; these helpers cover the extra
 * "only an owner may manage an owner"-style checks the services enforce.
 *
 * Pure and Nest-free. The role hierarchy is total: `owner > admin > member`.
 */
import type { Role } from '@cue/types';

/** Ordinal rank per role — higher outranks lower. */
const ROLE_RANK: Record<Role, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

/** The full RBAC role set, most-privileged first. */
export const ALL_ROLES: readonly Role[] = ['owner', 'admin', 'member'];

/** Numeric rank of a role (owner=3, admin=2, member=1). */
export function roleRank(role: Role): number {
  return ROLE_RANK[role];
}

/** True when `role` is at least as privileged as `min`. */
export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/**
 * Narrow an arbitrary `org_members.role` (which includes the billing-only
 * pseudo-role) to the RBAC {@link Role} subset. Returns `null` for roles
 * outside the hierarchy (e.g. 'billing').
 */
export function toRbacRole(role: string): Role | null {
  return role === 'owner' || role === 'admin' || role === 'member' ? role : null;
}
