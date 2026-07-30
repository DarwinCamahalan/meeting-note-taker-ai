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
  /** Port the standalone /metrics + /readyz + /livez server binds (METRICS_PORT). */
  readonly metricsPort: number;
  /** Region tag stamped on metrics/logs (AWS_REGION); undefined when unset. */
  readonly region: string | undefined;
  /**
   * Regional admission-control budget (70 §2.3, §4.4, ADR-70.3). These are the
   * *per-region* provider ceilings this orchestrator meters against — NOT a
   * shared global pool. Claude RPM (requests/min) and STT concurrent-stream
   * leases both draw from that region's own budget. `0` disables the local gate
   * (dev). The full production path is a control-Redis token bucket; this
   * process holds a conservative local budget = ceiling / expected-instances,
   * which is also the §2.6 fail-open fallback when control Redis is briefly out.
   */
  readonly claudeRpmLimit: number;
  /** Per-region concurrent STT stream ceiling (STT_CONCURRENCY). `0` disables. */
  readonly sttConcurrency: number;
}

/** Fallback bind address when ORCHESTRATOR_GRPC_ADDR is unset. */
const DEFAULT_GRPC_ADDR = '0.0.0.0:50051';

/** Fallback /metrics port when METRICS_PORT is unset. */
const DEFAULT_METRICS_PORT = 9464;

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
    metricsPort: parsePort(optional(env, 'METRICS_PORT'), DEFAULT_METRICS_PORT),
    region: optional(env, 'AWS_REGION'),
    claudeRpmLimit: parseCount(optional(env, 'CLAUDE_RPM_LIMIT'), 0),
    sttConcurrency: parseCount(optional(env, 'STT_CONCURRENCY'), 0),
  };
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`[ai-orchestrator] invalid METRICS_PORT value: ${raw}`);
  }
  return port;
}

/** Parse a non-negative integer admission knob; `0` (default) disables the gate. */
function parseCount(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`[ai-orchestrator] invalid non-negative integer: ${raw}`);
  }
  return value;
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
