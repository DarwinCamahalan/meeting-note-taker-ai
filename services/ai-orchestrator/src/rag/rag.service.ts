/**
 * RagService — owns the ai-orchestrator's retrieval stack and mints a
 * tenant-bound {@link RagContextProvider} per live session.
 *
 * RAG is entirely opt-in: it activates only when BOTH VOYAGE_API_KEY and
 * DATABASE_URL are configured. When either is absent, {@link providerFor}
 * returns `undefined` and the pipeline runs the unchanged no-RAG path — the
 * local/desktop and gateway paths never regress.
 *
 * The retriever is process-shared (one embeddings client + one pg pool);
 * per-session scoping (orgId + the session's documentIds) is applied by the
 * returned provider, so tenant isolation is enforced on every query.
 */
import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { createDb } from '@cue/db';
import {
  Retriever,
  VoyageEmbeddingsClient,
  type RagContextProvider,
  type RagRetrievalResult,
} from '@cue/core';
import { PgVectorSearch } from './pgvector-search.js';
import { ORCHESTRATOR_CONFIG, type OrchestratorEnv } from '../config/env.js';

/** Default nearest-neighbours per session retrieval (23 §3.4, "k = 6"). */
const DEFAULT_TOP_K = 6;

/** The pg Pool type, derived from @cue/db so `pg` need not be a direct dep. */
type DbPool = ReturnType<typeof createDb>['pool'];

@Injectable()
export class RagService implements OnModuleDestroy {
  private readonly logger = new Logger(RagService.name);
  private readonly retriever: Retriever | undefined;
  private readonly pool: DbPool | undefined;

  constructor(@Inject(ORCHESTRATOR_CONFIG) config: OrchestratorEnv) {
    if (!config.voyageApiKey || !config.databaseUrl) {
      this.logger.log('RAG disabled (VOYAGE_API_KEY and/or DATABASE_URL unset).');
      return;
    }
    const { db, pool } = createDb({ connectionString: config.databaseUrl });
    this.pool = pool;
    this.retriever = new Retriever({
      embeddings: new VoyageEmbeddingsClient({ apiKey: config.voyageApiKey }),
      search: new PgVectorSearch(db),
      defaultTopK: DEFAULT_TOP_K,
    });
    this.logger.log('RAG enabled (voyage-3.5 + pgvector).');
  }

  /** Whether retrieval is configured for this process. */
  get enabled(): boolean {
    return this.retriever !== undefined;
  }

  /**
   * A retrieval seam bound to one session's tenant + document scope, or
   * `undefined` when RAG is disabled. `documentIds` narrows to the session's
   * scoped documents when provided; an empty list means the whole org corpus.
   */
  providerFor(orgId: string, documentIds: readonly string[]): RagContextProvider | undefined {
    const retriever = this.retriever;
    if (!retriever) return undefined;
    const scoped = documentIds.length > 0 ? [...documentIds] : undefined;
    return {
      retrieve: (query: string): Promise<RagRetrievalResult> =>
        retriever.retrieve({
          orgId,
          query,
          ...(scoped ? { documentIds: scoped } : {}),
        }),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
