import type { AudioChunk, CueEvent, SessionState, TranscriptEvent } from '@cue/types';
import type { RagContextProvider } from './rag/context-provider.js';
import type { LocalWhisperOptions } from './stt/local-whisper-client.js';

/**
 * The runnable AI pipeline consumed by the Electron main process.
 * A single instance owns one STT stream and drives cue generation.
 *
 * `on*` register callbacks (last-writer-wins is acceptable for Phase 0;
 * the orchestrator may support one subscriber per channel).
 */
export interface CuePipeline {
  start(): Promise<void>;
  stop(): Promise<void>;
  pushAudio(c: AudioChunk): void;
  onState(cb: (s: SessionState) => void): void;
  onTranscript(cb: (t: TranscriptEvent) => void): void;
  onCue(cb: (e: CueEvent) => void): void;
}

/**
 * Optional RAG grounding for a session (Phase 2). Entirely opt-in: when absent,
 * the pipeline behaves exactly as the Phase 0/1 no-RAG path (no extra I/O, and
 * the Claude prompt bytes are unchanged so prompt caching is unaffected).
 */
export interface RagConfig {
  /** Tenant-bound retrieval seam (org + documentId scoping lives in the adapter). */
  provider: RagContextProvider;
  /**
   * Max wall-clock the pipeline waits for the (one-per-session) retrieval before
   * proceeding without it — a hard latency guard. Default 400 ms.
   */
  budgetMs?: number;
}

/**
 * Reliability tuning for the live-cue path (docs/70-scalability §5). Entirely
 * opt-out: when absent the resilient STT/LLM wrappers are on with their spec
 * defaults (circuit breakers + graceful degradation, never retry the live cue).
 * The healthy path is byte-identical to Phase 0.
 */
export interface ReliabilityConfig {
  /** Master switch for the resilience wrappers. Default `true`. */
  enabled?: boolean;
  /**
   * Observed Claude time-to-first-token (ms) above which the ladder steps to
   * `reduced` (shorter cues, throttle). Default 900 (server-latency SLO).
   */
  slowTtftMs?: number;
}

/** Credentials required to construct the pipeline. Read from env in main. */
export interface OrchestratorConfig {
  anthropicApiKey: string;
  /**
   * Deepgram API key — only required when {@link sttProvider} resolves to
   * `deepgram`. Omit it to run the free, offline `local-whisper` provider.
   */
  deepgramApiKey?: string;
  /**
   * Speech-to-text backend. When omitted it defaults to `deepgram` if a
   * `deepgramApiKey` is present, otherwise `local-whisper` (free, offline,
   * no key — runs whisper.cpp on-device).
   */
  sttProvider?: 'deepgram' | 'local-whisper';
  /** Tuning for the `local-whisper` provider (model, gpu, VAD cadence). */
  whisper?: LocalWhisperOptions;
  /** Optional RAG grounding; omit for the local/no-RAG path. */
  rag?: RagConfig;
  /** Optional reliability tuning; omit for the resilient defaults. */
  reliability?: ReliabilityConfig;
}

/**
 * The minimal context handed to the LLM for a single cue turn.
 *
 * Phase 0 assembles a rolling transcript only. Later phases enrich this with
 * resume/job-description grounding, retrieval, and speaker diarization
 * (see docs/23-prompt-context-spec.md).
 */
export interface CueContext {
  /** Concatenated recent final transcript text, oldest -> newest. */
  rollingTranscript: string;
  /** The most recent final transcript events retained in the rolling window. */
  recentFinals: TranscriptEvent[];
  /**
   * Optional RAG grounding (Phase 2). `sessionBlock` is the frozen, serialized
   * session-stable context injected as a cached system block (23 §4.1);
   * absent on the no-RAG path.
   */
  rag?: CueRagContext;
}

/** Serialized RAG blocks partitioned by prompt-cache volatility (23 §4.1). */
export interface CueRagContext {
  /** Frozen session-stable block for the cached system prefix. */
  sessionBlock?: string;
  /** Volatile per-cue block merged into the (non-cached) user turn. */
  hotBlock?: string;
}
