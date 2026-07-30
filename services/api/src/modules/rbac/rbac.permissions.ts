/**
 * Static role -> permission capability table. Feature code should prefer role
 * checks; this map exists for the endpoints that need sub-role granularity
 * (e.g. members read but only admins manage the shared KB). Kept beside the
 * guard so the two never drift.
 */
import type { Permission, Role } from '@cue/types';

const ADMIN_PERMISSIONS: readonly Permission[] = [
  'org.settings.read',
  'org.settings.write',
  'members.read',
  'members.invite',
  'members.update',
  'members.remove',
  'sso.manage',
  'audit.read',
  'kb.read',
  'kb.manage',
];

/** Every permission an org role holds. `owner` ⊇ `admin` ⊇ `member`. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: [...ADMIN_PERMISSIONS, 'billing.manage'],
  admin: ADMIN_PERMISSIONS,
  member: ['org.settings.read', 'members.read', 'kb.read'],
};

/** True when `role` is granted `permission`. */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
