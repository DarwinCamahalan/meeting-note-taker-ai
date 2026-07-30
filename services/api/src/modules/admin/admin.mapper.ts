/**
 * Row -> wire-DTO mappers for the AdminModule (org settings + audit-log
 * serialization). Date -> ISO-8601 conversion and role narrowing live here, out
 * of the service.
 */
import type { AuditLog as AuditLogRow, Org as OrgRow } from '@cue/db';
import type { AuditLogEntry, OrgSettings, Role } from '@cue/types';

/** Extra org-level settings not yet backed by their own column (see service TODO). */
export interface DerivedOrgSettings {
  ssoDomains: string[];
  allowDomainJoin: boolean;
  defaultMemberRole: Role;
}

export function toOrgSettings(org: OrgRow, derived: DerivedOrgSettings): OrgSettings {
  return {
    orgId: org.id,
    name: org.name,
    slug: org.slug,
    ssoDomains: derived.ssoDomains,
    allowDomainJoin: derived.allowDomainJoin,
    defaultMemberRole: derived.defaultMemberRole,
  };
}

export function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    orgId: row.orgId,
    actorUserId: row.actorUserId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    ip: row.ip,
    userAgent: row.userAgent,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}
