/**
 * DocumentsModule — RAG ingest (upload/list/get) + the pgvector retrieval
 * stack. {@link RetrievalService} (Voyage query embedding + pgvector cosine
 * top-k) is exported so other modules can perform org-scoped retrieval.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { EmbeddingsService } from './embeddings.service.js';
import { PgVectorSearchService } from './pgvector-search.service.js';
import { RetrievalService } from './retrieval.service.js';
import { TeamKbController } from './team-kb.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [DocumentsController, TeamKbController],
  providers: [
    DocumentsService,
    EmbeddingsService,
    PgVectorSearchService,
    RetrievalService,
  ],
  exports: [RetrievalService, EmbeddingsService],
})
export class DocumentsModule {}
