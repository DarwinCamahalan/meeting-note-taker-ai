import { createOrchestrator, type CuePipeline, type OrchestratorConfig } from '@cue/core';

/**
 * Thin main-process wrapper that constructs the Phase 0 cue pipeline.
 *
 * Keeps the main coordinator (`main/index.ts`) decoupled from the concrete
 * orchestrator: it depends only on the {@link CuePipeline} contract while this
 * module owns the wiring to `@cue/core`. Credentials come from the environment
 * (read in `main/index.ts`); nothing is hardcoded here.
 */
export function createPipeline(cfg: OrchestratorConfig): CuePipeline {
  return createOrchestrator(cfg);
}
