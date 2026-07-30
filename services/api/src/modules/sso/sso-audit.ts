/**
 * Minimal audit-log write helper for the SsoModule's admin-sensitive actions
 * (connection create/delete, SCIM provision/deprovision). `audit_logs` is
 * append-only; this only ever inserts.
 *
 * NOTE(handoff): Phase-3 task 2 introduces a shared audit-log interceptor for
 * all admin domains. When it lands, these call sites should migrate to it; the
 * {@link AuditAction} values used here are already the canonical ones.
 */
import { auditLogs } from '@cue/db';
import type { AuditAction } from '@cue/types';
import type { Database } from '@cue/db';

export interface AuditEntryInput {
  orgId: string;
  action: AuditAction;
  actorUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

/** Insert one append-only audit-log row. Never throws on a serialization edge. */
export async function writeAuditLog(db: Database, entry: AuditEntryInput): Promise<void> {
  await db.insert(auditLogs).values({
    orgId: entry.orgId,
    action: entry.action,
    actorUserId: entry.actorUserId ?? null,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
    metadata: entry.metadata ?? {},
  });
}
