import { createOrchestrator, type CuePipeline, type RagConfig } from '@cue/core';
import { Inject, Injectable } from '@nestjs/common';
import type { StartSession } from '@cue/proto';
import { ORCHESTRATOR_CONFIG, type OrchestratorEnv } from '../config/env.js';
import { RagService } from '../rag/rag.service.js';

/**
 * Owns the credentials for the `@cue/core` pipeline and mints a fresh,
 * unstarted {@link CuePipeline} per gRPC stream. When RAG is enabled and the
 * StartSession carries an org, it attaches a tenant-scoped retrieval seam so
 * the pipeline grounds cues against the session's documents; otherwise the
 * no-RAG path is used unchanged.
 */
@Injectable()
export class OrchestratorService {
  constructor(
    @Inject(ORCHESTRATOR_CONFIG) private readonly config: OrchestratorEnv,
    private readonly rag: RagService,
  ) {}

  /** Construct a new pipeline instance for a single live session. */
  create(start?: StartSession): CuePipeline {
    return createOrchestrator({
      anthropicApiKey: this.config.anthropicApiKey,
      sttProvider: this.config.sttProvider,
      ...(this.config.deepgramApiKey ? { deepgramApiKey: this.config.deepgramApiKey } : {}),
      ...(this.config.sttProvider === 'local-whisper'
        ? { whisper: { model: this.config.whisperModel } }
        : {}),
      ...this.ragConfig(start),
    });
  }

  /** Build the optional RAG config for this session, if retrieval is enabled. */
  private ragConfig(start?: StartSession): { rag?: RagConfig } {
    if (!start?.orgId) return {};
    const provider = this.rag.providerFor(
      start.orgId,
      start.userId || undefined,
      start.documentIds ?? [],
    );
    return provider ? { rag: { provider } } : {};
  }
}
