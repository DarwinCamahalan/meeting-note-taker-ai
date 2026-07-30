/**
 * RetrievalService — the NestJS-provided composition of the `@cue/core`
 * {@link Retriever}: Voyage query embedding + the pgvector {@link VectorSearchPort}
 * adapter. This is the org-scoped RAG top-k entry point for the api process
 * (and the reference implementation the ai-orchestrator mirrors on its hot path).
 */
import { Injectable } from '@nestjs/common';
import { Retriever, type RagRetrievalResult, type RetrievalQuery } from '@cue/core';
import { EmbeddingsService } from './embeddings.service.js';
import { PgVectorSearchService } from './pgvector-search.service.js';

@Injectable()
export class RetrievalService {
  private cached: Retriever | undefined;

  constructor(
    private readonly embeddings: EmbeddingsService,
    private readonly search: PgVectorSearchService,
  ) {}

  /** Embed the query and return org-scoped top-k matches (highest score first). */
  retrieve(query: RetrievalQuery): Promise<RagRetrievalResult> {
    return this.retriever().retrieve(query);
  }

  /** Lazily built so an unset VOYAGE_API_KEY only errors when RAG is used. */
  private retriever(): Retriever {
    this.cached ??= new Retriever({
      embeddings: this.embeddings.client,
      search: this.search,
    });
    return this.cached;
  }
}
