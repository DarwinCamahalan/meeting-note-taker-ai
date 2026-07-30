/**
 * Typed environment for the ai-orchestrator.
 *
 * All secrets/config come from the process environment (never hardcoded).
 * `@nestjs/config` loads the repo `.env` into `process.env`; this module
 * validates it into a strongly-typed object provided under {@link ORCHESTRATOR_CONFIG}.
 */

/** DI token for the resolved {@link OrchestratorEnv}. */
export const ORCHESTRATOR_CONFIG = Symbol('ORCHESTRATOR_CONFIG');

/** Validated runtime configuration for the gRPC orchestrator server. */
export interface OrchestratorEnv {
  /** host:port the gRPC server binds to (ORCHESTRATOR_GRPC_ADDR). */
  readonly grpcAddr: string;
  /** Anthropic API key handed to `@cue/core` (Claude cue streaming). */
  readonly anthropicApiKey: string;
  /** Deepgram API key handed to `@cue/core` (live STT). */
  readonly deepgramApiKey: string;
  /**
   * Voyage AI key for `voyage-3.5` query embeddings. Optional: when unset (or
   * DATABASE_URL is unset) RAG grounding is disabled and the pipeline runs the
   * no-RAG path unchanged.
   */
  readonly voyageApiKey: string | undefined;
  /** Postgres + pgvector connection string for RAG retrieval. Optional. */
  readonly databaseUrl: string | undefined;
}

/** Fallback bind address when ORCHESTRATOR_GRPC_ADDR is unset. */
const DEFAULT_GRPC_ADDR = '0.0.0.0:50051';

/**
 * Read + validate the environment. Throws a clear error naming any missing
 * required secret so a misconfigured deploy fails fast at boot.
 */
export function loadOrchestratorEnv(env: NodeJS.ProcessEnv = process.env): OrchestratorEnv {
  return {
    grpcAddr: optional(env, 'ORCHESTRATOR_GRPC_ADDR') ?? DEFAULT_GRPC_ADDR,
    anthropicApiKey: required(env, 'ANTHROPIC_API_KEY'),
    deepgramApiKey: required(env, 'DEEPGRAM_API_KEY'),
    voyageApiKey: optional(env, 'VOYAGE_API_KEY'),
    databaseUrl: optional(env, 'DATABASE_URL'),
  };
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = optional(env, key);
  if (!value) {
    throw new Error(`[ai-orchestrator] missing required env var ${key}`);
  }
  return value;
}

function optional(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}
