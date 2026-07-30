/**
 * RequireRoleGuard — the authoritative server-side RBAC gate. Reads the
 * {@link RbacRequirement} set by `@RequireRole(...)` and verifies the caller's
 * membership role in the *target org* (the `:orgId` path param, falling back to
 * the token's org) satisfies it. Denials render as an RFC 9457 problem+json
 * carrying `code: FORBIDDEN_ROLE`.
 *
 * Resolving the role from `org_members` (not the JWT `roles` claim) means an
 * admin endpoint on `/v1/orgs/:orgId/...` is checked against the caller's role
 * *in that specific org*, even when the path org differs from the token org.
 *
 * MUST run AFTER {@link JwtAuthGuard} (which populates `req.authContext`); wire
 * it as `@UseGuards(JwtAuthGuard, RequireRoleGuard)`.
 */
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import { orgMembers } from '@cue/db';
import { REQUIRE_ROLE_METADATA_KEY, type RbacRequirement, type Role } from '@cue/types';
import type { AuthedRequest } from '../../common/auth-context.js';
import { forbidden, unauthorized } from '../../common/problem-details.js';
import { DbService } from '../../database/db.service.js';
import { roleHasPermission } from './rbac.permissions.js';

const RBAC_ROLES: readonly Role[] = ['owner', 'admin', 'member'];

@Injectable()
export class RequireRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DbService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<RbacRequirement | undefined>(
      REQUIRE_ROLE_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    // No role declared on this route -> nothing to gate.
    if (!requirement) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.authContext) {
      throw unauthorized('Not authenticated.');
    }

    const orgId = this.resolveOrgId(req);
    const role = await this.resolveRole(req.authContext.userId, orgId);
    if (!role || !requirement.roles.includes(role)) {
      throw forbidden(
        `This action requires one of the following roles: ${requirement.roles.join(', ')}.`,
      );
    }
    if (requirement.permission && !roleHasPermission(role, requirement.permission)) {
      throw forbidden(`Your role lacks the "${requirement.permission}" permission.`);
    }
    return true;
  }

  /** Prefer the `:orgId` path param; fall back to the token's active org. */
  private resolveOrgId(req: AuthedRequest): string {
    const params = req.params as Record<string, string | undefined>;
    return params['orgId'] ?? req.authContext!.orgId;
  }

  /** The caller's `org_members.role` in `orgId`, narrowed to an RBAC {@link Role}. */
  private async resolveRole(userId: string, orgId: string): Promise<Role | undefined> {
    const [membership] = await this.db.db
      .select({ role: orgMembers.role })
      .from(orgMembers)
      .where(and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, orgId)))
      .limit(1);
    if (!membership) return undefined;
    return RBAC_ROLES.includes(membership.role as Role) ? (membership.role as Role) : undefined;
  }
}
