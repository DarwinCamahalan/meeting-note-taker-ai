/**
 * AdminService — org overview, org settings, and the audit-log query behind the
 * team admin console. Settings whose column exists (`name`, `slug`) persist to
 * `orgs`; `ssoDomains` is derived read-only from the org's SSO connections.
 *
 * TODO(phase-3, needs DB migration): `allowDomainJoin` and `defaultMemberRole`
 * have no backing column yet, so they read as documented defaults and PATCH of
 * those two fields is accepted-but-not-persisted (logged). Promote to an
 * `orgs.settings` jsonb (or dedicated columns) in a follow-up @cue/db migration.
 */
import { Injectable, Logger } from '@nestjs/common';
import { and, count, desc, eq, lt } from 'drizzle-orm';
import { auditLogs, invitations, orgMembers, orgs, ssoConnections } from '@cue/db';
import type { AuditLogEntry, OrgSettings, Paginated, Role } from '@cue/types';
import type { AuthContext } from '../../common/auth-context.js';
import { notFound } from '../../common/problem-details.js';
import { DbService } from '../../database/db.service.js';
import type { ListAuditLogsQueryDto, UpdateOrgSettingsRequestDto } from '../../contracts/index.js';
import { AuditService } from '../audit/audit.service.js';
import type { AdminOrgOverview } from './admin.types.js';
import { toAuditLogEntry, toOrgSettings, type DerivedOrgSettings } from './admin.mapper.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
/** Documented defaults for the not-yet-persisted settings fields (see TODO). */
const DEFAULT_ALLOW_DOMAIN_JOIN = false;
const DEFAULT_MEMBER_ROLE: Role = 'member';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /** Org overview: identity + plan + light membership counts + settings. */
  async getOverview(orgId: string): Promise<AdminOrgOverview> {
    const org = await this.orgRow(orgId);
    const [memberCount, pendingInvites, derived] = await Promise.all([
      this.memberCount(orgId),
      this.pendingInviteCount(orgId),
      this.derivedSettings(orgId),
    ]);
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      dataRegion: org.dataRegion,
      isPersonal: org.isPersonal,
      memberCount,
      pendingInvites,
      settings: toOrgSettings(org, derived),
      createdAt: org.createdAt.toISOString(),
    };
  }

  /** Read the org's settings view. */
  async getSettings(orgId: string): Promise<OrgSettings> {
    const org = await this.orgRow(orgId);
    return toOrgSettings(org, await this.derivedSettings(orgId));
  }

  /** Partial settings update. Persists `name`/`slug`; others are logged TODO. */
  async updateSettings(
    actor: AuthContext,
    orgId: string,
    dto: UpdateOrgSettingsRequestDto,
  ): Promise<OrgSettings> {
    await this.orgRow(orgId); // 404 if missing

    const patch: Partial<{ name: string; slug: string }> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.slug !== undefined) patch.slug = dto.slug;
    if (Object.keys(patch).length > 0) {
      await this.db.db.update(orgs).set(patch).where(eq(orgs.id, orgId));
    }
    if (
      dto.allowDomainJoin !== undefined ||
      dto.defaultMemberRole !== undefined ||
      dto.ssoDomains !== undefined
    ) {
      this.logger.warn(
        `Org ${orgId}: allowDomainJoin/defaultMemberRole/ssoDomains PATCH not persisted (no backing column yet).`,
      );
    }

    await this.audit.record({
      orgId,
      action: 'org.settings.update',
      actorUserId: actor.userId,
      targetType: 'org',
      targetId: orgId,
      metadata: { fields: Object.keys(dto) },
    });

    const org = await this.orgRow(orgId);
    return toOrgSettings(org, await this.derivedSettings(orgId));
  }

  /** Cursor-paginated audit trail, newest first, with optional action/actor filters. */
  async listAuditLogs(
    orgId: string,
    query: ListAuditLogsQueryDto,
  ): Promise<Paginated<AuditLogEntry>> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const conditions = [eq(auditLogs.orgId, orgId)];
    if (query.cursor !== undefined) conditions.push(lt(auditLogs.id, query.cursor));
    if (query.action !== undefined) conditions.push(eq(auditLogs.action, query.action));
    if (query.actorUserId !== undefined) {
      conditions.push(eq(auditLogs.actorUserId, query.actorUserId));
    }

    const rows = await this.db.db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map(toAuditLogEntry),
      nextCursor: hasMore && last ? last.id : null,
      hasMore,
    };
  }

  private async orgRow(orgId: string) {
    const [org] = await this.db.db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
    if (!org) throw notFound('Org not found.');
    return org;
  }

  private async memberCount(orgId: string): Promise<number> {
    const [row] = await this.db.db
      .select({ n: count() })
      .from(orgMembers)
      .where(eq(orgMembers.orgId, orgId));
    return row?.n ?? 0;
  }

  private async pendingInviteCount(orgId: string): Promise<number> {
    const [row] = await this.db.db
      .select({ n: count() })
      .from(invitations)
      .where(and(eq(invitations.orgId, orgId), eq(invitations.status, 'pending')));
    return row?.n ?? 0;
  }

  private async derivedSettings(orgId: string): Promise<DerivedOrgSettings> {
    const rows = await this.db.db
      .select({ domain: ssoConnections.domain })
      .from(ssoConnections)
      .where(eq(ssoConnections.orgId, orgId));
    return {
      ssoDomains: rows.map((r) => r.domain),
      allowDomainJoin: DEFAULT_ALLOW_DOMAIN_JOIN,
      defaultMemberRole: DEFAULT_MEMBER_ROLE,
    };
  }
}
