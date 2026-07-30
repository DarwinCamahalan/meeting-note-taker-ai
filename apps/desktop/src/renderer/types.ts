import type { SessionState } from '@cue/types';

/**
 * Renderer-local UI types. Cross-process contracts live in `@cue/types`; this
 * file holds only view-model shapes that never leave the renderer.
 */

/** Lifecycle of a single cue as reduced from the streamed {@link CueEvent}s. */
export type CueStatus = 'streaming' | 'done' | 'none' | 'error';

/** A view-model for one cue, assembled from its stream of delta/done events. */
export interface CueVm {
  /** Stable id grouping all events of this cue (mirrors `CueEvent.id`). */
  id: string;
  /** Concatenated cue text so far. */
  text: string;
  status: CueStatus;
}

/**
 * Which audio AssistMe listens to:
 *   - `mic`    — only the local user's microphone (privacy-safest default).
 *   - `system` — only system-audio loopback (the other participants).
 *   - `both`   — mic + system mixed into one stream (full conversation).
 * `system` and `both` require the one-time consent gate.
 */
export type AudioSource = 'mic' | 'system' | 'both';

/** Imperative handle returned by the audio capture hook. */
export interface AudioCapture {
  /** True while capture is open and PCM is flowing to the main process. */
  capturing: boolean;
  /** Last capture error (e.g. permission denied), or `null`. */
  error: string | null;
  /** Open the selected source(s) and begin streaming 16 kHz mono PCM. */
  start(source: AudioSource): Promise<void>;
  /** Tear down the capture graph and release all devices/streams. */
  stop(): void;
}

export type { SessionState };
