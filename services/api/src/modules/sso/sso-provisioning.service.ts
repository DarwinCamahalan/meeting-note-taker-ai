/**
 * SsoProvisioningService — the idempotent identity upsert shared by the SSO
 * callback (JIT provisioning) and the SCIM directory-sync webhook. It maps an
 * IdP subject onto our `users` + `org_members` rows without ever touching the
 * consumer PKCE path.
 *
 * Idempotent by design: a repeated event (WorkOS retries, at-least-once SCIM
 * delivery) converges to the same state — users are keyed by email, memberships
 * by (orgId, userId) with `onConflictDoNothing`.
 */
import { Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { orgMembers, orgs, users } from '@cue/db';
import type { Org as OrgRow, User as UserRow } from '@cue/db';
import type { OrgRole } from '@cue/types';
import { notFound } from '../../common/problem-details.js';
import { DbService } from '../../database/db.service.js';

export interface ProvisionMemberParams {
  orgId: string;
  email: string;
  /** Stable WorkOS subject (profile id / directory-user idpId). */
  workosSubject: string;
  displayName?: string | null;
  /** Role to grant when the membership is first created (default 'member'). */
  role?: OrgRole;
}

export interface ProvisionedMember {
  user: UserRow;
  org: OrgRow;
  /** The effective membership role (existing role wins over the requested one). */
  role: OrgRole;
  /** True when a new `org_members` row was created by this call. */
  membershipCreated: boolean;
}

@Injectable()
export class SsoProvisioningService {
  private readonly logger = new Logger(SsoProvisioningService.name);

  constructor(private readonly db: DbService) {}

  /**
   * Find-or-create the user (keyed by email) and ensure an org membership. The
   * user's data region follows the org's. An existing membership is never
   * downgraded — SSO/SCIM only *adds* access here; role changes go through the
   * admin RBAC endpoints.
   */
  async provisionMember(params: ProvisionMemberParams): Promise<ProvisionedMember> {
    const org = await this.loadOrg(params.orgId);
    const requestedRole: OrgRole = params.role ?? 'member';

    return this.db.db.transaction(async (tx): Promise<ProvisionedMember> => {
      // 1) Upsert the user by email (links to an existing consumer account too).
      let [user] = await tx.select().from(users).where(eq(users.email, params.email)).limit(1);
      if (!user) {
        await tx
          .insert(users)
          .values({
            email: params.email,
            clerkUserId: `workos|${params.workosSubject}`,
            displayName: params.displayName ?? null,
            dataRegion: org.dataRegion,
            lastActiveAt: new Date(),
          })
          .onConflictDoNothing({ target: users.email });
        [user] = await tx.select().from(users).where(eq(users.email, params.email)).limit(1);
      }
      if (!user) {
        throw new Error('Failed to provision SSO user.');
      }

      // 2) Ensure the membership (idempotent; existing role is preserved).
      const [existing] = await tx
        .select()
        .from(orgMembers)
        .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, user.id)))
        .limit(1);

      if (existing) {
        return { user, org, role: existing.role, membershipCreated: false };
      }

      await tx
        .insert(orgMembers)
        .values({ orgId: org.id, userId: user.id, role: requestedRole })
        .onConflictDoNothing({ target: [orgMembers.orgId, orgMembers.userId] });

      const [member] = await tx
        .select()
        .from(orgMembers)
        .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, user.id)))
        .limit(1);

      return {
        user,
        org,
        role: member?.role ?? requestedRole,
        membershipCreated: Boolean(member),
      };
    });
  }

  /**
   * Remove a member from an org (SCIM deprovision). Idempotent: a no-op when the
   * user or membership is already gone. Returns the removed user id, if any.
   */
  async deprovisionMember(orgId: string, email: string): Promise<string | undefined> {
    const [user] = await this.db.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user) {
      this.logger.debug(`Deprovision no-op: no user for ${email}.`);
      return undefined;
    }

    await this.db.db
      .delete(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, user.id)));
    return user.id;
  }

  private async loadOrg(orgId: string): Promise<OrgRow> {
    const [org] = await this.db.db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
    if (!org) {
      throw notFound(`Org ${orgId} not found.`);
    }
    return org;
  }
}
