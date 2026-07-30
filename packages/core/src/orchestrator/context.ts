import type { TranscriptEvent } from '@cue/types';
import type { CueContext } from '../types.js';

/** Rolling window duration retained for cue context (§3.3). */
const WINDOW_MS = 30_000;

/** Hard cap on retained final turns, to bound prompt size. */
const MAX_TURNS = 12;

/**
 * Minimal, pure-ish rolling-transcript assembler for Phase 0.
 *
 * Retains only the recent `final` transcript turns (partials are transient UI
 * state and never enter the cue prompt). `build()` composes the
 * {@link CueContext} handed to the LLM — a speaker-agnostic concatenation of
 * the recent finals, oldest -> newest. Later phases enrich this with
 * retrieval, profile grounding, and diarization (docs/23-prompt-context-spec.md).
 */
export class RollingTranscript {
  private finals: TranscriptEvent[] = [];

  /** Record a committed (`final`) transcript turn. No-op for empty text. */
  add(event: TranscriptEvent): void {
    if (event.kind !== 'final') return;
    if (event.text.trim().length === 0) return;
    this.finals.push(event);
    this.prune(event.ts);
  }

  /** Assemble the cue context for the current window. */
  build(nowMs: number = Date.now()): CueContext {
    this.prune(nowMs);
    const recentFinals = [...this.finals];
    const rollingTranscript = recentFinals
      .map((t) => t.text.trim())
      .filter((t) => t.length > 0)
      .join('\n');
    return { rollingTranscript, recentFinals };
  }

  /** Clear all retained turns (session end / restart). */
  reset(): void {
    this.finals = [];
  }

  /** Drop turns older than the window, then cap to the most recent N. */
  private prune(nowMs: number): void {
    const cutoff = nowMs - WINDOW_MS;
    this.finals = this.finals.filter((t) => t.ts >= cutoff);
    if (this.finals.length > MAX_TURNS) {
      this.finals = this.finals.slice(this.finals.length - MAX_TURNS);
    }
  }
}
