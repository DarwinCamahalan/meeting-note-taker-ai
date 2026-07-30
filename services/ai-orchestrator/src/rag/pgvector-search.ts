/**
 * PgVectorSearch — the ai-orchestrator's hot-path adapter for the `@cue/core`
 * {@link VectorSearchPort}. Same contract as the api reference implementation:
 * org-scoped cosine top-k over `document_chunks` using the HNSW
 * `vector_cosine_ops` index, with the tenant filter applied BEFORE ranking
 * (30 §5). Cosine similarity = `1 - (embedding <=> query)`, clamped to 0..1.
 */
import { sql } from 'drizzle-orm';
import type { Database } from '@cue/db';
import type { VectorSearchParams, VectorSearchPort } from '@cue/core';
import { estimateTokens } from '@cue/core';
import type { DocumentKind, RagChunkMatch } from '@cue/types';

interface SearchRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  token_count: number | null;
  doc_kind: DocumentKind;
  score: number | string;
}

export class PgVectorSearch implements VectorSearchPort {
  constructor(private readonly db: Database) {}

  async search(params: VectorSearchParams): Promise<RagChunkMatch[]> {
    const { orgId, queryEmbedding, topK } = params;
    if (topK <= 0 || queryEmbedding.length === 0) return [];

    const vectorLiteral = `[${queryEmbedding.join(',')}]`;
    const scopeFilter =
      params.documentIds && params.documentIds.length > 0
        ? sql`AND c.document_id = ANY(${params.documentIds})`
        : sql``;

    const result = await this.db.execute(sql`
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
    return rows.map((row) => toMatch(row)).filter((m) => m.score >= minScore);
  }
}

function toMatch(row: SearchRow): RagChunkMatch {
  return {
    chunkId: row.id,
    documentId: row.document_id,
    docType: row.doc_kind,
    sourceSpan: `${row.doc_kind}#chunk[${row.chunk_index}]`,
    content: row.content,
    score: clamp01(Number(row.score)),
    tokenCount: row.token_count ?? estimateTokens(row.content),
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
