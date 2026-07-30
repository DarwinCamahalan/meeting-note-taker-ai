import { createOrchestrator, type CuePipeline } from '@cue/core';
import { Inject, Injectable } from '@nestjs/common';
import { ORCHESTRATOR_CONFIG, type OrchestratorEnv } from '../config/env.js';

/**
 * Owns the credentials for the `@cue/core` pipeline and mints a fresh,
 * unstarted {@link CuePipeline} per gRPC stream. Kept trivial so stream
 * lifecycle logic lives entirely in {@link StreamSession}.
 */
@Injectable()
export class OrchestratorService {
  constructor(@Inject(ORCHESTRATOR_CONFIG) private readonly config: OrchestratorEnv) {}

  /** Construct a new pipeline instance for a single live session. */
  create(): CuePipeline {
    return createOrchestrator({
      anthropicApiKey: this.config.anthropicApiKey,
      deepgramApiKey: this.config.deepgramApiKey,
    });
  }
}
