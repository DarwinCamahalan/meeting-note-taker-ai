/**
 * Shared column helpers + pgEnums used across every schema module.
 * Keeping IDs/timestamps consistent here prevents per-table drift.
 */
import { sql } from 'drizzle-orm';
import { pgEnum, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Every table gets a server-generated, time-ordered UUIDv7 PK so B-tree
 * inserts stay append-friendly under high transcript-segment write volume.
 * Postgres 16 has no native `uuidv7()`; migration 0000 installs a SQL shim.
 */
export const primaryId = () => uuid('id').primaryKey().default(sql`uuidv7()`);

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** Soft-delete marker used by GDPR erasure + retention jobs. */
export const softDelete = {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

export const dataRegionEnum = pgEnum('data_region', ['us', 'eu']);
export const planEnum = pgEnum('plan', ['free', 'pro', 'team', 'enterprise']);
export const orgRoleEnum = pgEnum('org_role', ['owner', 'admin', 'member', 'billing']);

export const sessionModeEnum = pgEnum('session_mode', [
  'interview_prep',
  'interview_live',
  'sales',
  'support',
  'meeting_notes',
]);

export const sessionStatusEnum = pgEnum('session_status', [
  'created',
  'active',
  'ended',
  'processing',
  'failed',
  'purged',
]);

export const documentKindEnum = pgEnum('document_kind', [
  'resume',
  'job_description',
  'knowledge_base',
  'product_doc',
  'other',
]);

/**
 * Team-KB visibility (Phase 3). `org` = shared across all org members (the
 * default for the team knowledge base); `personal` = visible only to the
 * uploading user, even inside a multi-member org. RAG retrieval and the
 * document lists apply this scope on top of the `org_id` tenant filter.
 */
export const documentVisibilityEnum = pgEnum('document_visibility', ['personal', 'org']);

export const documentStatusEnum = pgEnum('document_status', [
  'awaiting_upload',
  'uploaded',
  'parsing',
  'embedding',
  'ready',
  'failed',
]);

export const usageKindEnum = pgEnum('usage_kind', [
  'live_minutes',
  'stt_seconds',
  'llm_input_tokens',
  'llm_output_tokens',
  'rag_query',
]);
