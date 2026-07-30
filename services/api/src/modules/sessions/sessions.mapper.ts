/** Maps a persisted session row (@cue/db) to the wire {@link Session} DTO. */
import type { Session as SessionRow } from '@cue/db';
import type { Session } from '@cue/types';

export function toSessionDto(row: SessionRow): Session {
  return {
    id: row.id,
    orgId: row.orgId,
    userId: row.userId,
    // The DB column is `mode`; the API contract calls it `kind` (same union).
    kind: row.mode,
    title: row.title,
    disclosed: row.disclosed,
    status: row.status,
    language: row.language,
    // TODO(MVP): persist a session<->document scope join; empty until then.
    documentIds: [],
    durationSeconds: row.durationSeconds,
    createdAt: row.createdAt.toISOString(),
  };
}
