import { randomUUID } from 'node:crypto';
import type { AudioChunk, CueEvent, SessionState, TranscriptEvent } from '@cue/types';
import { ClaudeCueClient } from '../llm/claude-cue-client.js';
import { DeepgramSttClient } from '../stt/deepgram-client.js';
import type { CuePipeline, OrchestratorConfig } from '../types.js';
import { RollingTranscript } from './context.js';

/**
 * Wires STT -> LLM into the Phase 0 end-to-end thread.
 *
 * Control flow:
 *   - `start()`  -> open the STT stream, state `listening`.
 *   - on a `final` transcript -> state `thinking`, stream a cue from
 *     {@link ClaudeCueClient} over the rolling transcript, emit `cue` frames
 *     (state `cue` on first delta), then back to `listening`.
 *   - a `<none>` result emits `{ kind: 'none' }` and returns to `listening`.
 *   - a newer final supersedes any in-flight cue (its stream is aborted).
 *
 * `on*` register one sink per channel (last-writer-wins) — sufficient for the
 * single main-process consumer in Phase 0.
 */
export class CueOrchestrator implements CuePipeline {
  private readonly stt: DeepgramSttClient;
  private readonly llm: ClaudeCueClient;
  private readonly transcript = new RollingTranscript();

  private stateCb: ((s: SessionState) => void) | undefined;
  private transcriptCb: ((t: TranscriptEvent) => void) | undefined;
  private cueCb: ((e: CueEvent) => void) | undefined;

  private started = false;
  /** Aborts the currently-streaming cue when a newer one supersedes it. */
  private cueController: AbortController | undefined;

  constructor(config: OrchestratorConfig) {
    this.stt = new DeepgramSttClient({ apiKey: config.deepgramApiKey });
    this.llm = new ClaudeCueClient({ apiKey: config.anthropicApiKey });
    this.stt.onTranscript((t) => this.handleTranscript(t));
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      await this.stt.start();
      this.setState('listening');
    } catch (err) {
      this.started = false;
      this.setState('error');
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.started = false;
    this.abortInFlightCue();
    await this.stt.stop();
    this.transcript.reset();
    this.setState('idle');
  }

  pushAudio(chunk: AudioChunk): void {
    this.stt.pushAudio(chunk);
  }

  onState(cb: (s: SessionState) => void): void {
    this.stateCb = cb;
  }

  onTranscript(cb: (t: TranscriptEvent) => void): void {
    this.transcriptCb = cb;
  }

  onCue(cb: (e: CueEvent) => void): void {
    this.cueCb = cb;
  }

  private handleTranscript(event: TranscriptEvent): void {
    this.emitTranscript(event);
    if (event.kind !== 'final' || event.text.trim().length === 0) return;
    this.transcript.add(event);
    void this.generateCue();
  }

  private async generateCue(): Promise<void> {
    // A newer utterance supersedes any cue still streaming.
    this.abortInFlightCue();
    const controller = new AbortController();
    this.cueController = controller;

    this.setState('thinking');
    const context = this.transcript.build();

    try {
      for await (const event of this.llm.streamCue(context, controller.signal)) {
        if (controller.signal.aborted) return;
        if (event.kind === 'delta') this.setState('cue');
        this.emitCue(event);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        this.emitCue({ kind: 'error', id: randomUUID(), text: errorMessage(err) });
      }
    } finally {
      if (this.cueController === controller) this.cueController = undefined;
      // Only settle back to listening if this cue was not superseded and the
      // session is still running.
      if (!controller.signal.aborted && this.started) {
        this.setState('listening');
      }
    }
  }

  private abortInFlightCue(): void {
    this.cueController?.abort();
    this.cueController = undefined;
  }

  private setState(state: SessionState): void {
    this.stateCb?.(state);
  }

  private emitTranscript(event: TranscriptEvent): void {
    this.transcriptCb?.(event);
  }

  private emitCue(event: CueEvent): void {
    this.cueCb?.(event);
  }
}

/** Factory: construct the Phase 0 orchestrator from credentials. */
export function createOrchestrator(cfg: OrchestratorConfig): CueOrchestrator {
  return new CueOrchestrator(cfg);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
