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

/** Imperative handle returned by the microphone capture hook. */
export interface AudioCapture {
  /** True while the mic is open and PCM is flowing to the main process. */
  capturing: boolean;
  /** Last capture error (e.g. permission denied), or `null`. */
  error: string | null;
  /** Open the mic and begin streaming 16 kHz mono PCM. */
  start(): Promise<void>;
  /** Tear down the mic graph and release the device. */
  stop(): void;
}

export type { SessionState };
