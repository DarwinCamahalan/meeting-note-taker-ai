import { createOrchestrator, type CuePipeline, type OrchestratorConfig } from '@cue/core';
import { GatewayPipeline, type GatewayPipelineConfig } from './gateway-client';

/**
 * Thin main-process factory that selects the cue pipeline implementation.
 *
 * Two backends implement the same {@link CuePipeline} contract, so the main
 * coordinator stays backend-agnostic:
 *   - `local`   (default) — Phase 0 in-process @cue/core (Deepgram + Claude).
 *   - `gateway`           — streams through ws-gateway ({@link GatewayPipeline}).
 *
 * The choice comes from `CUE_BACKEND`; keeping the local path the default means
 * Phase 0 is never regressed. Credentials/URLs come from the environment (read
 * in `main/index.ts`); nothing is hardcoded here.
 */

/** Which pipeline backend to construct. */
export type CueBackend = 'local' | 'gateway';

export interface CreatePipelineOptions {
  backend: CueBackend;
  /** Credentials for the local (@cue/core) pipeline. */
  local: OrchestratorConfig;
  /** Wiring for the gateway pipeline; required when `backend === 'gateway'`. */
  gateway?: GatewayPipelineConfig;
}

/** Resolve the backend from an env bag (defaults to the Phase 0 local path). */
export function resolveBackend(env: NodeJS.ProcessEnv): CueBackend {
  return env['CUE_BACKEND'] === 'gateway' ? 'gateway' : 'local';
}

/** Construct the selected pipeline. */
export function createPipeline(opts: CreatePipelineOptions): CuePipeline {
  if (opts.backend === 'gateway') {
    if (!opts.gateway) {
      throw new Error('CUE_BACKEND=gateway requires gateway configuration.');
    }
    return new GatewayPipeline(opts.gateway);
  }
  return createOrchestrator(opts.local);
}
