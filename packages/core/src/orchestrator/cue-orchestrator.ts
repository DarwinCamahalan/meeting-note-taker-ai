import { randomUUID } from 'node:crypto';
import type { AudioChunk, CueEvent, SessionState, TranscriptEvent } from '@cue/types';
import { ClaudeCueClient } from '../llm/claude-cue-client.js';
import type { RagConfig } from '../types.js';
import {
  SESSION_RAG_BUDGET,
  serializeMatches,
  trimMatches,
  type RagContextProvider,
} from '../rag/context-provider.js';
import { DeepgramSttClient } from '../stt/deepgram-client.js';
import type { CueContext, CuePipeline, OrchestratorConfig } from '../types.js';
import {
  DegradationController,
  ResilientCueClient,
  ResilientSttClient,
  type DegradationChange,
  type SttClient,
} from '../reliability/index.js';
import { RollingTranscript } from './context.js';

/** Default hard cap on the one-per-session retrieval wait (latency guard). */
const DEFAULT_RAG_BUDGET_MS = 400;

/** The minimal streaming-LLM surface the orchestrator consumes. */
interface CueStreamer {
  streamCue(context: CueContext, signal?: AbortSignal): AsyncGenerator<CueEvent>;
}

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
  private readonly stt: SttClient;
  private readonly llm: CueStreamer;
  private readonly transcript = new RollingTranscript();

  private stateCb: ((s: SessionState) => void) | undefined;
  private transcriptCb: ((t: TranscriptEvent) => void) | undefined;
  private cueCb: ((e: CueEvent) => void) | undefined;
  private degradationCb: ((change: DegradationChange) => void) | undefined;

  private started = false;
  /** Aborts the currently-streaming cue when a newer one supersedes it. */
  private cueController: AbortController | undefined;

  /* --- Reliability (Phase 4) — graceful degradation ladder (70 §5.3). --- */
  private readonly degradation: DegradationController | undefined;

  /* --- RAG (Phase 2, opt-in) --- */
  private readonly rag: RagContextProvider | undefined;
  private readonly ragBudgetMs: number;
  /** Frozen, serialized session-stable RAG block (23 §4.1). */
  private sessionRagBlock: string | undefined;
  /** Retrieval is attempted exactly once per session, on the first real query. */
  private ragPrimed = false;

  constructor(config: OrchestratorConfig) {
    const resilient = config.reliability?.enabled ?? true;
    if (resilient) {
      const degradation = new DegradationController({
        onChange: (change) => this.degradationCb?.(change),
      });
      this.degradation = degradation;
      this.stt = new ResilientSttClient({
        factory: () => new DeepgramSttClient({ apiKey: config.deepgramApiKey }),
        onDegradation: (level) => degradation.setStt(level),
      });
      this.llm = new ResilientCueClient({
        client: new ClaudeCueClient({ apiKey: config.anthropicApiKey }),
        degradation,
        ...(config.reliability?.slowTtftMs !== undefined
          ? { slowTtftMs: config.reliability.slowTtftMs }
          : {}),
      });
    } else {
      this.degradation = undefined;
      this.stt = new DeepgramSttClient({ apiKey: config.deepgramApiKey });
      this.llm = new ClaudeCueClient({ apiKey: config.anthropicApiKey });
    }
    this.stt.onTranscript((t) => this.handleTranscript(t));
    this.rag = config.rag?.provider;
    this.ragBudgetMs = ragBudget(config.rag);
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
    this.sessionRagBlock = undefined;
    this.ragPrimed = false;
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

  /**
   * Subscribe to graceful-degradation ladder transitions (70 §5.3) for
   * logs/metrics/UI. No-op when reliability is disabled. Last-writer-wins.
   */
  onDegradation(cb: (change: DegradationChange) => void): void {
    this.degradationCb = cb;
  }

  private handleTranscript(event: TranscriptEvent): void {
    this.emitTranscript(event);
    if (event.kind !== 'final' || event.text.trim().length === 0) return;
    this.transcript.add(event);
    // Ladder step 3/5: auto-cues paused (Claude shedding or STT unavailable).
    // The transcript ribbon above still flows — the user is never blind.
    if (this.degradation && !this.degradation.autoCuesEnabled) return;
    void this.generateCue();
  }

  private async generateCue(): Promise<void> {
    // A newer utterance supersedes any cue still streaming.
    this.abortInFlightCue();
    const controller = new AbortController();
    this.cueController = controller;

    this.setState('thinking');
    const context = this.transcript.build();

    // Ground the session once (budget-bounded) on the first real query; the
    // frozen block is reused by every later cue so the cached prefix is stable.
    await this.ensureSessionRag(context.rollingTranscript);
    if (controller.signal.aborted) return;
    if (this.sessionRagBlock) {
      context.rag = { sessionBlock: this.sessionRagBlock };
    }

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

  /**
   * Attempt retrieval once per session, using the first non-empty transcript as
   * the query. Bounded by {@link ragBudgetMs}; on timeout/error the session
   * simply proceeds ungrounded (no regression to the cue path).
   */
  private async ensureSessionRag(query: string): Promise<void> {
    if (!this.rag || this.ragPrimed) return;
    const text = query.trim();
    if (text.length === 0) return;
    this.ragPrimed = true; // prime at most once, even if this attempt fails

    try {
      const result = await withTimeout(this.rag.retrieve(text), this.ragBudgetMs);
      if (result && result.matches.length > 0) {
        const trimmed = trimMatches(result.matches, SESSION_RAG_BUDGET);
        if (trimmed.length > 0) this.sessionRagBlock = serializeMatches(trimmed);
      }
    } catch {
      // Swallow: grounding is best-effort and must never block a cue.
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

/** Resolve the RAG wait budget, falling back to the default. */
function ragBudget(rag: RagConfig | undefined): number {
  const ms = rag?.budgetMs;
  return ms !== undefined && ms > 0 ? ms : DEFAULT_RAG_BUDGET_MS;
}

/**
 * Race a promise against a timeout, resolving to `undefined` on timeout. The
 * underlying work is not cancelled — the caller just stops waiting on it.
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}
