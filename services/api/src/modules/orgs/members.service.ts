/**
 * MembersService — admin member listing + role management for an org. Enforces
 * the RBAC business rules the coarse guard cannot express:
 *  - only an owner may grant, revoke, or modify the `owner` role;
 *  - the last remaining owner cannot be demoted or removed (an org always keeps
 *    at least one owner).
 * `ssoLinked` is derived from the org's active SSO connection domains.
 */
import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, lt } from 'drizzle-orm';
import { orgMembers, ssoConnections, users } from '@cue/db';
import type { AdminMemberView, Paginated, Role } from '@cue/types';
import type { AuthContext } from '../../common/auth-context.js';
import { conflict, forbidden, notFound } from '../../common/problem-details.js';
import { DbService } from '../../database/db.service.js';
import type { ListMembersQueryDto, UpdateMemberRequestDto } from '../../contracts/index.js';
import { AuditService } from '../audit/audit.service.js';
import { toAdminMemberView, type MemberJoin } from './orgs.mapper.js';
import { toRbacRole } from '../rbac/rbac.util.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class MembersService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /** Cursor-paginated admin member list (newest membership first). */
  async list(orgId: string, query: ListMembersQueryDto): Promise<Paginated<AdminMemberView>> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const where =
      query.cursor !== undefined
        ? and(eq(orgMembers.orgId, orgId), lt(orgMembers.id, query.cursor))
        : eq(orgMembers.orgId, orgId);

    const rows = await this.db.db
      .select({
        id: orgMembers.id,
        userId: orgMembers.userId,
        orgId: orgMembers.orgId,
        role: orgMembers.role,
        joinedAt: orgMembers.joinedAt,
        email: users.email,
        displayName: users.displayName,
        lastActiveAt: users.lastActiveAt,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(where)
      .orderBy(desc(orgMembers.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);

    const ssoDomains = await this.activeSsoDomains(orgId);
    return {
      data: page.map((r) => toAdminMemberView(r, domainLinked(r.email, ssoDomains))),
      nextCursor: hasMore && last ? last.id : null,
      hasMore,
    };
  }

  /** Change a member's role. Owner-role changes require the actor to be an owner. */
  async updateRole(
    actor: AuthContext,
    orgId: string,
    targetUserId: string,
    dto: UpdateMemberRequestDto,
  ): Promise<AdminMemberView> {
    const target = await this.memberJoin(orgId, targetUserId);
    if (!target) throw notFound('Member not found.');

    const actorRole = await this.actorRole(orgId, actor.userId);
    const currentRole = toRbacRole(target.role) ?? 'member';

    // Only an owner may grant or revoke ownership.
    if ((dto.role === 'owner' || currentRole === 'owner') && actorRole !== 'owner') {
      throw forbidden('Only an owner can change the owner role.');
    }
    // Never demote the last owner.
    if (currentRole === 'owner' && dto.role !== 'owner' && (await this.ownerCount(orgId)) <= 1) {
      throw conflict('An org must keep at least one owner.');
    }

    if (currentRole !== dto.role) {
      await this.db.db
        .update(orgMembers)
        .set({ role: dto.role })
        .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, targetUserId)));
      await this.audit.record({
        orgId,
        action: 'member.role.update',
        actorUserId: actor.userId,
        targetType: 'user',
        targetId: targetUserId,
        metadata: { from: currentRole, to: dto.role },
      });
    }

    const updated = await this.memberJoin(orgId, targetUserId);
    if (!updated) throw notFound('Member not found after update.');
    const ssoDomains = await this.activeSsoDomains(orgId);
    return toAdminMemberView(updated, domainLinked(updated.email, ssoDomains));
  }

  /** Remove a member. Owners can only be removed by owners, never the last one. */
  async remove(actor: AuthContext, orgId: string, targetUserId: string): Promise<void> {
    const target = await this.memberJoin(orgId, targetUserId);
    if (!target) throw notFound('Member not found.');

    const actorRole = await this.actorRole(orgId, actor.userId);
    const currentRole = toRbacRole(target.role) ?? 'member';

    if (currentRole === 'owner' && actorRole !== 'owner') {
      throw forbidden('Only an owner can remove an owner.');
    }
    if (currentRole === 'owner' && (await this.ownerCount(orgId)) <= 1) {
      throw conflict('An org must keep at least one owner.');
    }

    await this.db.db
      .delete(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, targetUserId)));

    await this.audit.record({
      orgId,
      action: 'member.remove',
      actorUserId: actor.userId,
      targetType: 'user',
      targetId: targetUserId,
      metadata: { role: currentRole },
    });
  }

  /** Whether `email`'s domain matches one of the org's active SSO connections. */
  async isSsoLinked(orgId: string, email: string): Promise<boolean> {
    return domainLinked(email, await this.activeSsoDomains(orgId));
  }

  private async actorRole(orgId: string, userId: string): Promise<Role | null> {
    const [row] = await this.db.db
      .select({ role: orgMembers.role })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
      .limit(1);
    return row ? toRbacRole(row.role) : null;
  }

  private async ownerCount(orgId: string): Promise<number> {
    const [row] = await this.db.db
      .select({ n: count() })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, 'owner')));
    return row?.n ?? 0;
  }

  private async activeSsoDomains(orgId: string): Promise<Set<string>> {
    const rows = await this.db.db
      .select({ domain: ssoConnections.domain })
      .from(ssoConnections)
      .where(and(eq(ssoConnections.orgId, orgId), eq(ssoConnections.status, 'active')));
    return new Set(rows.map((r) => r.domain.toLowerCase()));
  }

  private async memberJoin(orgId: string, userId: string): Promise<MemberJoin | undefined> {
    const [row] = await this.db.db
      .select({
        userId: orgMembers.userId,
        orgId: orgMembers.orgId,
        role: orgMembers.role,
        joinedAt: orgMembers.joinedAt,
        email: users.email,
        displayName: users.displayName,
        lastActiveAt: users.lastActiveAt,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
      .limit(1);
    return row;
  }
}

/** True when the email's domain is in the active SSO-domain set. */
function domainLinked(email: string, domains: Set<string>): boolean {
  const at = email.lastIndexOf('@');
  if (at === -1) return false;
  return domains.has(email.slice(at + 1).toLowerCase());
}
