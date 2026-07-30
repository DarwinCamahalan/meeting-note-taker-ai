/**
 * Sessions domain: sessions, transcripts, transcript_segments.
 * See 30-data-model.md §3.3. Only FINAL segments are persisted; interim/partial
 * STT results live in Redis and never touch Postgres.
 */
import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { primaryId, sessionModeEnum, sessionStatusEnum, timestamps } from './_shared.js';
import { orgs, users } from './identity.js';

export const sessions = pgTable(
  'sessions',
  {
    id: primaryId(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    mode: sessionModeEnum('mode').notNull(),
    status: sessionStatusEnum('status').notNull().default('created'),
    /** "disclosed mode" — consent surfaced to all parties. */
    disclosed: boolean('disclosed').notNull().default(false),
    title: text('title'),
    language: text('language').notNull().default('en'),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    /** Stamped from the org's retention policy; swept by retention-sweep. */
    purgeAfter: timestamp('purge_after', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    byOrg: index('sessions_org_idx').on(t.orgId, t.startedAt),
    byUser: index('sessions_user_idx').on(t.userId, t.startedAt),
    purgeIdx: index('sessions_purge_idx').on(t.purgeAfter),
  }),
);

export const transcripts = pgTable(
  'transcripts',
  {
    id: primaryId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    language: text('language').notNull().default('en'),
    segmentCount: integer('segment_count').notNull().default(0),
    /** AI-generated post-session summary (per-org envelope-encrypted; TODO). */
    summary: text('summary'),
    ...timestamps,
  },
  (t) => ({
    bySession: index('transcripts_session_idx').on(t.sessionId),
  }),
);

export const transcriptSegments = pgTable(
  'transcript_segments',
  {
    id: primaryId(),
    transcriptId: uuid('transcript_id')
      .notNull()
      .references(() => transcripts.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    /** 'me' | 'them' | 'unknown' (diarization). */
    speaker: text('speaker').notNull().default('unknown'),
    /** Per-org envelope-encrypted at the app layer (documented TODO). */
    content: text('content').notNull(),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    isFinal: boolean('is_final').notNull().default(true),
    /** 0-100. */
    confidence: integer('confidence'),
    ...timestamps,
  },
  (t) => ({
    byTranscript: index('segments_transcript_idx').on(t.transcriptId, t.startMs),
  }),
);
