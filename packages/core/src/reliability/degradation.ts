/**
 * Graceful-degradation ladder for the live-cue path (docs/70-scalability §5.3).
 *
 * The product must stay *useful* as its two external, latency-variable
 * dependencies (STT, Claude) slow or fail — "degrade, never hang". This module
 * is the pure state machine that tracks where on the ladder a live session is
 * and what cue parameters that step implies. It holds no I/O and no provider
 * SDK: the resilient client wrappers drive it from circuit-breaker transitions
 * and time-to-first-token measurements, and the orchestrator reads it to decide
 * whether (and how) to emit a cue.
 *
 * Ladder (70 §5.3), split into an LLM axis and an STT axis:
 *  1. all green                       -> llm=normal,   stt=primary
 *  2. Claude slow / near TPM cap      -> llm=reduced   (shorter max_tokens,
 *                                        lower cue frequency, dedup harder)
 *  3. Claude shedding                 -> llm=shedding  (pause auto-cues; the
 *                                        transcript ribbon stays live)
 *  4. STT primary down                -> stt=failover  (transparent reconnect /
 *                                        secondary provider)
 *  5. both STT down                   -> stt=unavailable ("transcription
 *                                        unavailable"; capture keeps running,
 *                                        cues paused)
 *
 * Step 6 (entitlement / minute cap) is owned by the entitlements service, not
 * this pipeline, and is intentionally out of scope here.
 */

/** Claude health axis of the ladder (steps 1-3). */
export type LlmDegradation = 'normal' | 'reduced' | 'shedding';

/** STT health axis of the ladder (steps 1, 4-5). */
export type SttDegradation = 'primary' | 'failover' | 'unavailable';

/** Cue-generation parameters implied by the current LLM ladder step. */
export interface DegradationTuning {
  /** Hard ceiling on cue output tokens for this step. */
  readonly maxTokens: number;
  /** Minimum spacing between auto-cues (ms) — "dedup harder / lower frequency". */
  readonly minCueIntervalMs: number;
  /** Whether auto-cues fire at all. `false` on the shedding step (transcript-only). */
  readonly autoCuesEnabled: boolean;
}

/** A single degradation-state change, surfaced for logs/metrics/UI. */
export interface DegradationChange {
  readonly axis: 'llm' | 'stt';
  readonly from: LlmDegradation | SttDegradation;
  readonly to: LlmDegradation | SttDegradation;
  readonly at: number;
}

/** Full snapshot of the ladder position. */
export interface DegradationSnapshot {
  readonly llm: LlmDegradation;
  readonly stt: SttDegradation;
  readonly tuning: DegradationTuning;
  readonly transcriptionAvailable: boolean;
  readonly autoCuesEnabled: boolean;
}

/**
 * Per-step cue tuning. `maxTokens` for the normal step matches the Phase 0
 * ClaudeCueClient ceiling (160) so the healthy path is byte-identical.
 */
export const TUNING_BY_LEVEL: Readonly<Record<LlmDegradation, DegradationTuning>> = {
  normal: { maxTokens: 160, minCueIntervalMs: 0, autoCuesEnabled: true },
  // Step 2: shorten output + throttle frequency to relieve TPM pressure.
  reduced: { maxTokens: 96, minCueIntervalMs: 1_500, autoCuesEnabled: true },
  // Step 3: pause auto-cues entirely; the transcript ribbon carries the session.
  shedding: { maxTokens: 96, minCueIntervalMs: 0, autoCuesEnabled: false },
};

/**
 * Tunable overrides for {@link DegradationController}. Any omitted field keeps
 * the default from {@link TUNING_BY_LEVEL}.
 */
export interface DegradationOptions {
  /** Injectable clock for deterministic tests. Default `Date.now`. */
  now?: () => number;
  /** Fired on every ladder transition (either axis). */
  onChange?: (change: DegradationChange) => void;
  /** Per-level tuning overrides (merged over the defaults). */
  tuning?: Partial<Record<LlmDegradation, Partial<DegradationTuning>>>;
}

/**
 * Mutable, in-memory position on the degradation ladder for a single session.
 * Thread-affine to one orchestrator instance; no locking needed.
 */
export class DegradationController {
  private llmLevel: LlmDegradation = 'normal';
  private sttLevel: SttDegradation = 'primary';

  private readonly now: () => number;
  private readonly onChange: ((change: DegradationChange) => void) | undefined;
  private readonly tuningByLevel: Readonly<Record<LlmDegradation, DegradationTuning>>;

  constructor(options: DegradationOptions = {}) {
    this.now = options.now ?? Date.now;
    this.onChange = options.onChange;
    this.tuningByLevel = mergeTuning(options.tuning);
  }

  get llm(): LlmDegradation {
    return this.llmLevel;
  }

  get stt(): SttDegradation {
    return this.sttLevel;
  }

  /** Cue parameters for the current LLM ladder step. */
  tuning(): DegradationTuning {
    return this.tuningByLevel[this.llmLevel];
  }

  /** Auto-cues fire only when the LLM step allows AND STT is producing text. */
  get autoCuesEnabled(): boolean {
    return this.tuning().autoCuesEnabled && this.transcriptionAvailable;
  }

  /** True unless both STT providers are down (capture continues either way). */
  get transcriptionAvailable(): boolean {
    return this.sttLevel !== 'unavailable';
  }

  setLlm(level: LlmDegradation): void {
    if (level === this.llmLevel) return;
    const from = this.llmLevel;
    this.llmLevel = level;
    this.onChange?.({ axis: 'llm', from, to: level, at: this.now() });
  }

  setStt(level: SttDegradation): void {
    if (level === this.sttLevel) return;
    const from = this.sttLevel;
    this.sttLevel = level;
    this.onChange?.({ axis: 'stt', from, to: level, at: this.now() });
  }

  snapshot(): DegradationSnapshot {
    return {
      llm: this.llmLevel,
      stt: this.sttLevel,
      tuning: this.tuning(),
      transcriptionAvailable: this.transcriptionAvailable,
      autoCuesEnabled: this.autoCuesEnabled,
    };
  }
}

function mergeTuning(
  overrides: DegradationOptions['tuning'],
): Readonly<Record<LlmDegradation, DegradationTuning>> {
  if (!overrides) return TUNING_BY_LEVEL;
  const levels: LlmDegradation[] = ['normal', 'reduced', 'shedding'];
  const merged = {} as Record<LlmDegradation, DegradationTuning>;
  for (const level of levels) {
    merged[level] = { ...TUNING_BY_LEVEL[level], ...(overrides[level] ?? {}) };
  }
  return merged;
}
