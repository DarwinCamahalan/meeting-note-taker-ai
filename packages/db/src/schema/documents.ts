/**
 * Documents + pgvector chunks (RAG). See 30-data-model.md §3.4 and §5.
 *
 * Embeddings: Voyage AI `voyage-3.5` -> 1024 dims (identical model + space for
 * query AND document embeddings, per decision SR-09). The literal `1024` is
 * hard-coded here and MUST match the model output; changing the model requires
 * a re-embed + reindex migration.
 */
import { index, integer, pgTable, text, uuid, vector } from 'drizzle-orm/pg-core';
import {
  documentKindEnum,
  documentStatusEnum,
  documentVisibilityEnum,
  primaryId,
  timestamps,
} from './_shared.js';
import { orgs, users } from './identity.js';

export const documents = pgTable(
  'documents',
  {
    id: primaryId(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    kind: documentKindEnum('kind').notNull(),
    title: text('title').notNull(),
    /**
     * Team-KB scope. `org` (default) = shared with every org member; `personal`
     * = only the uploading `userId` can list/retrieve it. See §3.4 + Phase 3.
     */
    visibility: documentVisibilityEnum('visibility').notNull().default('org'),
    /** R2/S3 object key of the source file. */
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type'),
    byteSize: integer('byte_size'),
    status: documentStatusEnum('status').notNull().default('awaiting_upload'),
    ...timestamps,
  },
  (t) => ({
    byOrg: index('documents_org_idx').on(t.orgId),
    /** Team-KB + personal list/retrieval filter: (org-shared OR own personal). */
    byOrgVisibility: index('documents_org_visibility_idx').on(t.orgId, t.visibility),
  }),
);

export const documentChunks = pgTable(
  'document_chunks',
  {
    id: primaryId(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    /** Per-org envelope-encrypted at the app layer (documented TODO). */
    content: text('content').notNull(),
    tokenCount: integer('token_count'),
    /** voyage-3.5 @ 1024 dims; NOT enveloped (would break the ANN index). */
    embedding: vector('embedding', { dimensions: 1024 }).notNull(),
    ...timestamps,
  },
  (t) => ({
    byDoc: index('chunks_doc_idx').on(t.documentId, t.chunkIndex),
    /** Tenant filter applied BEFORE the ANN scan. */
    byOrg: index('chunks_org_idx').on(t.orgId),
    /** HNSW over cosine distance (m=16, ef_construction=64); see §5. */
    embeddingIdx: index('chunks_embedding_hnsw')
      .using('hnsw', t.embedding.op('vector_cosine_ops'))
      .with({ m: 16, ef_construction: 64 }),
  }),
);
