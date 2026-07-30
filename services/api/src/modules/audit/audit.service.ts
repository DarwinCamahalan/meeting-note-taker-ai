/**
 * AuditService — the single writer for the append-only `audit_logs` trail
 * (30-data-model.md §3.6). Admin-sensitive mutations call {@link record} (or are
 * recorded declaratively by {@link AuditInterceptor}). Writes never throw into
 * the request path: a failed audit insert is logged, not surfaced, so an audit
 * outage cannot take down a legitimate mutation.
 */
import { Injectable, Logger } from '@nestjs/common';
import { auditLogs } from '@cue/db';
import type { NewAuditLog } from '@cue/db';
import type { AuditAction } from '@cue/types';
import { DbService } from '../../database/db.service.js';

/** A single audit event to persist. `metadata` defaults to `{}`. */
export interface AuditEvent {
  orgId: string;
  action: AuditAction;
  actorUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly db: DbService) {}

  /** Persist one audit event. Best-effort: failures are logged, never thrown. */
  async record(event: AuditEvent): Promise<void> {
    const row: NewAuditLog = {
      orgId: event.orgId,
      action: event.action,
      actorUserId: event.actorUserId ?? null,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      ip: event.ip ?? null,
      userAgent: event.userAgent ?? null,
      metadata: event.metadata ?? {},
    };
    try {
      await this.db.db.insert(auditLogs).values(row);
    } catch (error) {
      this.logger.error(
        `Failed to write audit log (${event.action}, org=${event.orgId})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
