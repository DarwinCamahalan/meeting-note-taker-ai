/**
 * Audit logs. See 30-data-model.md §3.6.
 * Append-only + immutable at the app layer (no update/delete grants); the
 * compliance evidence trail. Retained independently of user data deletion.
 */
import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared.js';
import { orgs, users } from './identity.js';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: primaryId(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** 'session.start' | 'document.delete' | 'member.invite' | ... */
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').notNull().default({}),
    ...timestamps,
  },
  (t) => ({
    byOrgTime: index('audit_org_time_idx').on(t.orgId, t.createdAt),
  }),
);
