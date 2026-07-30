/**
 * `@Audit(action, options?)` — marks a mutation handler for automatic
 * audit-trail capture by {@link AuditInterceptor}. The interceptor records the
 * event only after the handler resolves successfully (a thrown/denied request
 * writes nothing).
 *
 *   @Audit('member.remove', { targetType: 'user', targetParam: 'userId' })
 *   @Delete(':userId')
 *   remove() { ... }
 */
import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import type { AuditAction } from '@cue/types';

/** NestJS metadata key the interceptor reads. */
export const AUDIT_METADATA_KEY = 'cue:audit' as const;

/** How the interceptor derives the audit target + extra metadata for a route. */
export interface AuditOptions {
  /** Value written to `audit_logs.target_type` (e.g. 'user', 'org', 'invite'). */
  targetType?: string;
  /** Route param whose value becomes `audit_logs.target_id` (e.g. 'userId'). */
  targetParam?: string;
  /**
   * When the target id is not a route param, pluck it from a field on the
   * handler's resolved response body (e.g. 'id' for a created invite).
   */
  targetResponseField?: string;
}

/** The metadata payload attached by {@link Audit}. */
export interface AuditMetadata extends AuditOptions {
  action: AuditAction;
}

export function Audit(action: AuditAction, options: AuditOptions = {}): CustomDecorator<string> {
  const metadata: AuditMetadata = { action, ...options };
  return SetMetadata(AUDIT_METADATA_KEY, metadata);
}
