/**
 * PgVectorSearchService — the concrete pgvector adapter for the DB-agnostic
 * {@link VectorSearchPort} defined in `@cue/core`. Runs the org-scoped cosine
 * top-k over `document_chunks` using the HNSW `vector_cosine_ops` index.
 *
 * Tenant safety (30 §5): the `org_id` filter is applied in the WHERE clause,
 * BEFORE ranking — never an unscoped ANN scan. `documentIds`, when given,
 * further narrows to a session's document scope. Cosine similarity is
 * `1 - (embedding <=> query)`, clamped to 0..1.
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { VectorSearchParams, VectorSearchPort } from '@cue/core';
import { estimateTokens } from '@cue/core';
import type { DocumentKind, RagChunkMatch } from '@cue/types';
import { DbService } from '../../database/db.service.js';

/** Row shape returned by the raw cosine query. */
interface SearchRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  token_count: number | null;
  doc_kind: DocumentKind;
  score: number | string;
}

@Injectable()
export class PgVectorSearchService implements VectorSearchPort {
  constructor(private readonly db: DbService) {}

  async search(params: VectorSearchParams): Promise<RagChunkMatch[]> {
    const { orgId, queryEmbedding, topK } = params;
    if (topK <= 0 || queryEmbedding.length === 0) return [];

    // pgvector literal, bound as a parameter (never interpolated) then ::vector cast.
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;
    const scopeFilter =
      params.documentIds && params.documentIds.length > 0
        ? sql`AND c.document_id = ANY(${params.documentIds})`
        : sql``;

    const result = await this.db.db.execute(sql`
      SELECT c.id AS id,
             c.document_id AS document_id,
             c.chunk_index AS chunk_index,
             c.content AS content,
             c.token_count AS token_count,
             d.kind AS doc_kind,
             1 - (c.embedding <=> ${vectorLiteral}::vector) AS score
      FROM document_chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE c.org_id = ${orgId}
      ${scopeFilter}
      ORDER BY c.embedding <=> ${vectorLiteral}::vector
      LIMIT ${topK}
    `);

    const rows = (result as unknown as { rows: SearchRow[] }).rows ?? [];
    const minScore = params.minScore ?? 0;

    return rows
      .map((row) => this.toMatch(row))
      .filter((m) => m.score >= minScore);
  }

  private toMatch(row: SearchRow): RagChunkMatch {
    const score = clamp01(Number(row.score));
    return {
      chunkId: row.id,
      documentId: row.document_id,
      docType: row.doc_kind,
      sourceSpan: `${row.doc_kind}#chunk[${row.chunk_index}]`,
      content: row.content,
      score,
      tokenCount: row.token_count ?? estimateTokens(row.content),
    };
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
