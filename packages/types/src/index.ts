/**
 * @cue/types — the single source of truth for contracts that cross a process
 * boundary in Cue: main <-> preload <-> renderer, and the STT -> LLM pipeline.
 *
 * These types are intentionally minimal (Phase 0 spike surface). Keep them
 * transport-agnostic: plain data only, no class instances, so they survive
 * Electron's structured-clone IPC.
 */

/** Lifecycle of a single copilot session, surfaced to the overlay UI. */
export type SessionState = 'idle' | 'listening' | 'thinking' | 'cue' | 'error';

/**
 * A slice of captured PCM audio flowing renderer -> main -> STT.
 * Phase 0 produces 16 kHz mono linear16 from the microphone.
 */
export interface AudioChunk {
  /** Raw PCM samples (linear16, little-endian). */
  data: ArrayBuffer;
  /** Samples per second (Phase 0: 16000). */
  sampleRate: number;
  /** Channel count (Phase 0: 1). */
  channels: number;
  /** Client capture timestamp (epoch ms). */
  ts: number;
}

/** A transcription result emitted by the STT client. */
export interface TranscriptEvent {
  /** `partial` = interim/unstable, `final` = endpointed and committed. */
  kind: 'partial' | 'final';
  text: string;
  /** Event timestamp (epoch ms). */
  ts: number;
}

/**
 * A unit of streamed cue output from the LLM.
 * - `delta`: incremental text token(s) to append to the current cue.
 * - `done`:  the current cue is complete.
 * - `none`:  the model decided no cue is warranted (`<none>` sentinel).
 * - `error`: cue generation failed; `text` may carry a human-readable reason.
 */
export interface CueEvent {
  kind: 'delta' | 'done' | 'none' | 'error';
  /** Stable id grouping all events belonging to one cue. */
  id: string;
  text?: string;
}

/**
 * The API surface exposed to the renderer on `window.cue` via the preload
 * contextBridge. Every method is a thin, typed proxy over Electron IPC.
 * Each `on*` subscriber returns an unsubscribe function.
 */
export interface IpcApi {
  startSession(): Promise<void>;
  stopSession(): Promise<void>;
  sendAudioChunk(c: AudioChunk): void;
  toggleOverlay(): void;
  onState(cb: (s: SessionState) => void): () => void;
  onTranscript(cb: (t: TranscriptEvent) => void): () => void;
  onCue(cb: (e: CueEvent) => void): () => void;
}

declare global {
  interface Window {
    cue: IpcApi;
  }
}

export {};
