/**
 * Retriever — org-scoped pgvector cosine top-k retrieval, kept DB-agnostic.
 *
 * `@cue/core` must not depend on `@cue/db` (it also runs in the desktop's local
 * path). So this module defines a PORT — {@link VectorSearchPort} — that a thin
 * adapter in `api` implements against Drizzle + pgvector, plus the {@link Retriever}
 * that composes the {@link VoyageEmbeddingsClient} with that port: embed the
 * query, then delegate the ANN scan. The tenant (`orgId`) filter is applied
 * BEFORE the ANN scan by the adapter (30 §5) — never trust an unscoped search.
 */
import type { RagChunkMatch, RagRetrievalResult } from '@cue/types';
import { VoyageEmbeddingsClient } from '../embeddings/voyage-client.js';

/** Parameters for one org-scoped vector search. */
export interface VectorSearchParams {
  /** Tenant filter, applied before the ANN scan. Required. */
  orgId: string;
  /** The 1024-d query embedding to rank against `document_chunks.embedding`. */
  queryEmbedding: number[];
  /** Number of nearest neighbours to return. */
  topK: number;
  /** Optional restriction to a document scope (e.g. a session's documentIds). */
  documentIds?: string[];
  /** Optional minimum cosine similarity (0..1); matches below are dropped. */
  minScore?: number;
}

/**
 * The DB-facing port. Implemented in `api` over `@cue/db`'s `Database`:
 * runs `1 - (embedding <=> $query)` cosine similarity, filtered by `orgId`
 * (and `documentIds` when given), ordered desc, limited to `topK`. Returns
 * fully-formed {@link RagChunkMatch}es (already scored + tenant-checked).
 */
export interface VectorSearchPort {
  search(params: VectorSearchParams): Promise<RagChunkMatch[]>;
}

/** Construction options for {@link Retriever}. */
export interface RetrieverOptions {
  embeddings: VoyageEmbeddingsClient;
  search: VectorSearchPort;
  /** Default top-k when a query omits it. Default 6. */
  defaultTopK?: number;
  /** Default minimum cosine similarity. Default 0 (no floor). */
  defaultMinScore?: number;
}

/** Per-call retrieval query. */
export interface RetrievalQuery {
  orgId: string;
  /** Natural-language query text (typically the latest transcript turn). */
  query: string;
  topK?: number;
  documentIds?: string[];
  minScore?: number;
}

/**
 * Composes query embedding + vector search into a {@link RagRetrievalResult}.
 * The result feeds context assembly in `ai-orchestrator` (23 §3.2/§3.4).
 */
export class Retriever {
  private readonly embeddings: VoyageEmbeddingsClient;
  private readonly search: VectorSearchPort;
  private readonly defaultTopK: number;
  private readonly defaultMinScore: number;

  constructor(options: RetrieverOptions) {
    this.embeddings = options.embeddings;
    this.search = options.search;
    this.defaultTopK = options.defaultTopK ?? 6;
    this.defaultMinScore = options.defaultMinScore ?? 0;
  }

  /** Embed the query and return org-scoped top-k matches, highest score first. */
  async retrieve(q: RetrievalQuery): Promise<RagRetrievalResult> {
    const text = q.query.trim();
    if (text.length === 0) return { query: q.query, matches: [] };

    const queryEmbedding = await this.embeddings.embedQuery(text);
    const matches = await this.search.search({
      orgId: q.orgId,
      queryEmbedding,
      topK: q.topK ?? this.defaultTopK,
      minScore: q.minScore ?? this.defaultMinScore,
      ...(q.documentIds ? { documentIds: q.documentIds } : {}),
    });

    matches.sort((a, b) => b.score - a.score);
    return { query: q.query, matches };
  }
}

/** Re-export for adapter authors building {@link RagChunkMatch}es. */
export type { RagChunkMatch, RagRetrievalResult };
