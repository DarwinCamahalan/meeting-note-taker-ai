import type { AudioChunk, CueEvent, SessionState, TranscriptEvent } from '@cue/types';

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

/** Credentials required to construct the pipeline. Read from env in main. */
export interface OrchestratorConfig {
  anthropicApiKey: string;
  deepgramApiKey: string;
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
}
