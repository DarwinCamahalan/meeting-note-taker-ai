/**
 * DocumentsService — RAG ingestion + read.
 *
 * Upload is synchronous for the Phase-2 inline-text flow: chunk (`@cue/core`
 * chunker) -> embed each chunk (voyage-3.5, input_type=document) -> persist the
 * `documents` row + its `document_chunks` (1024-d embeddings) atomically, then
 * mark the document `ready`. Listing uses keyset pagination on the time-ordered
 * uuidv7 PK (id desc == newest first), matching SessionsService.
 *
 * TODO(phase-2+): presigned object-upload flow (documents.storageKey) for large
 * / binary sources; today `storageKey` is a sentinel for inline text.
 */
import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, lt, or, type SQL, sql } from 'drizzle-orm';
import { documentChunks, documents } from '@cue/db';
import type { NewDocument, NewDocumentChunk } from '@cue/db';
import { chunkText } from '@cue/core';
import type { Document, DocumentUploadResponse, Paginated } from '@cue/types';
import type { AuthContext } from '../../common/auth-context.js';
import { internal, notFound } from '../../common/problem-details.js';
import { DbService } from '../../database/db.service.js';
import type {
  DocumentUploadRequestDto,
  ListDocumentsQueryDto,
  ListOrgDocumentsQueryDto,
} from '../../contracts/index.js';
import { EmbeddingsService } from './embeddings.service.js';
import { toDocumentDto } from './documents.mapper.js';
import { assertOrgManager, assertSameOrg } from './team-kb.access.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
/** Sentinel storage key for inline-text documents (no object store yet). */
const INLINE_STORAGE_KEY = 'inline';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly db: DbService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  /** Chunk + embed + persist a document, returning it with its chunk count. */
  async upload(
    ctx: AuthContext,
    body: DocumentUploadRequestDto,
  ): Promise<DocumentUploadResponse> {
    const chunks = chunkText(body.content);
    if (chunks.length === 0) {
      throw internal('Document produced no chunks after normalization.');
    }

    // Embed off the transaction (network I/O) before persisting atomically.
    const vectors = await this.embeddings.client.embed(
      chunks.map((c) => c.content),
      'document',
    );
    if (vectors.length !== chunks.length) {
      throw internal('Embedding count did not match chunk count.');
    }

    const docValues: NewDocument = {
      orgId: ctx.orgId,
      userId: ctx.userId,
      kind: body.kind,
      title: body.title,
      // Default to the shared team KB; callers opt into a private upload.
      visibility: body.visibility ?? 'org',
      storageKey: INLINE_STORAGE_KEY,
      mimeType: body.mimeType ?? null,
      byteSize: body.byteSize ?? null,
      status: 'ready',
    };

    const document = await this.db.db.transaction(async (tx) => {
      const [row] = await tx.insert(documents).values(docValues).returning();
      if (!row) throw internal('Failed to persist document.');

      const chunkValues: NewDocumentChunk[] = chunks.map((chunk, i) => ({
        documentId: row.id,
        orgId: ctx.orgId,
        chunkIndex: chunk.index,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        embedding: vectors[i] as number[],
      }));
      await tx.insert(documentChunks).values(chunkValues);
      return row;
    });

    return { document: toDocumentDto(document, chunks.length), chunkCount: chunks.length };
  }

  /**
   * Cursor-paginated list of documents the caller can see (newest first): the
   * org's shared team KB PLUS the caller's own personal uploads.
   */
  async list(ctx: AuthContext, query: ListDocumentsQueryDto): Promise<Paginated<Document>> {
    return this.paginate(query, this.visibleScope(ctx));
  }

  /**
   * Cursor-paginated list of the org's shared team KB (`visibility = 'org'`).
   * Personal uploads are excluded. Any org member may read. `orgId` must be the
   * caller's active org.
   */
  async listOrgKb(
    ctx: AuthContext,
    orgId: string,
    query: ListOrgDocumentsQueryDto,
  ): Promise<Paginated<Document>> {
    assertSameOrg(ctx, orgId);
    const scope = and(
      eq(documents.orgId, ctx.orgId),
      eq(documents.visibility, 'org'),
    ) as SQL;
    return this.paginate(query, scope);
  }

  /** Read one document the caller can see (shared KB or own personal). */
  async get(ctx: AuthContext, id: string): Promise<Document> {
    const [row] = await this.db.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), this.visibleScope(ctx)))
      .limit(1);
    if (!row) throw notFound('Document not found.');

    const counts = await this.chunkCounts([row.id]);
    return toDocumentDto(row, counts.get(row.id) ?? 0);
  }

  /**
   * Remove a document from the org's shared team KB. Owners/admins only
   * ("admins manage"); members are read-only. Chunk rows cascade via the FK.
   */
  async removeOrgDoc(ctx: AuthContext, orgId: string, documentId: string): Promise<void> {
    assertSameOrg(ctx, orgId);
    assertOrgManager(ctx);

    const [row] = await this.db.db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.orgId, ctx.orgId)))
      .limit(1);
    if (!row) throw notFound('Document not found.');

    await this.db.db.delete(documents).where(eq(documents.id, row.id));
  }

  /** The caller's visible-document predicate: shared team KB OR own personal. */
  private visibleScope(ctx: AuthContext): SQL {
    const scope = and(
      eq(documents.orgId, ctx.orgId),
      or(eq(documents.visibility, 'org'), eq(documents.userId, ctx.userId)),
    );
    // `and` with non-empty args is always defined; assert for the return type.
    return scope as SQL;
  }

  /** Shared keyset-pagination body over `documents`, given a base scope. */
  private async paginate(
    query: ListDocumentsQueryDto,
    scope: SQL,
  ): Promise<Paginated<Document>> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = query.cursor;

    const where = cursor !== undefined ? and(scope, lt(documents.id, cursor)) : scope;

    const rows = await this.db.db
      .select()
      .from(documents)
      .where(where)
      .orderBy(desc(documents.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);

    const counts = await this.chunkCounts(page.map((r) => r.id));

    return {
      data: page.map((r) => toDocumentDto(r, counts.get(r.id) ?? 0)),
      nextCursor: hasMore && last ? last.id : null,
      hasMore,
    };
  }

  /** Count chunks per document id in one grouped query (empty ids -> empty map). */
  private async chunkCounts(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.db
      .select({
        documentId: documentChunks.documentId,
        count: sql<number>`count(*)::int`,
      })
      .from(documentChunks)
      .where(inArray(documentChunks.documentId, ids))
      .groupBy(documentChunks.documentId);
    return new Map(rows.map((r) => [r.documentId, r.count]));
  }
}
