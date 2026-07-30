/**
 * Team-KB access checks. The shared knowledge base is org-scoped: any member
 * may read it, but only owners/admins may manage (delete) its documents
 * ("members read, admins manage"). Roles come from the verified access token
 * (`AuthContext.roles`), so no extra DB round-trip is needed on the hot path.
 *
 * Until the dedicated Phase-3 `@RequireRole` guard lands, these helpers keep
 * the team-KB authorization self-contained within the documents module.
 */
import type { OrgRole } from '@cue/types';
import type { AuthContext } from '../../common/auth-context.js';
import { forbidden } from '../../common/problem-details.js';

/** Roles allowed to manage (mutate/delete) the shared team knowledge base. */
const MANAGER_ROLES: ReadonlySet<OrgRole> = new Set<OrgRole>(['owner', 'admin']);

/**
 * A path `:orgId` must be the caller's active org — the access token is bound
 * to a single org, so cross-org access via the KB endpoints is rejected.
 */
export function assertSameOrg(ctx: AuthContext, orgId: string): void {
  if (ctx.orgId !== orgId) {
    throw forbidden('You do not have access to this organization.');
  }
}

/** Require the caller to be an owner/admin of their active org. */
export function assertOrgManager(ctx: AuthContext): void {
  const isManager = ctx.roles.some((role) => MANAGER_ROLES.has(role));
  if (!isManager) {
    throw forbidden('Only organization owners or admins can manage the team knowledge base.');
  }
}
