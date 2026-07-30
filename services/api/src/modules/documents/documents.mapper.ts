/** Maps a persisted `documents` row (@cue/db) to the wire {@link Document} DTO. */
import type { Document as DocumentRow } from '@cue/db';
import type { Document } from '@cue/types';

/**
 * `chunkCount` is not a column — it is derived (count of `document_chunks`) and
 * passed in by the caller so this mapper stays pure. The `storageKey` column is
 * intentionally never surfaced (clients reference documents by id only).
 */
export function toDocumentDto(row: DocumentRow, chunkCount: number): Document {
  return {
    id: row.id,
    orgId: row.orgId,
    userId: row.userId,
    kind: row.kind,
    title: row.title,
    status: row.status,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    chunkCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
