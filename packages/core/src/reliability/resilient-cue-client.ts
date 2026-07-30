/**
 * Resilient wrapper around the Claude cue client (docs/70-scalability §5.1
 * circuit breakers, §5.2 "never retry on the live-cue path", §5.3 ladder steps
 * 1-3).
 *
 * The live-cue path pairs a circuit breaker with NO retries: a retried cue is a
 * late cue, which is a useless cue. When Claude is slow or shedding we degrade
 * (shorter cues, then pause auto-cues) and let the next utterance produce a
 * fresh cue — we never queue or replay the current one.
 *
 * How the breaker wraps a streaming call: the "provider call" we protect is
 * *time to first token*. We race the first `iterator.next()` under the breaker's
 * `timeoutMs`; a timeout counts as a failure and eventually opens the breaker.
 * An `error` frame from the inner client is re-thrown so the breaker observes it
 * (the inner client swallows provider errors into `{kind:'error'}` events).
 */
import type { CueEvent } from '@cue/types';
import {
  CircuitBreaker,
  CircuitOpenError,
  CircuitTimeoutError,
  type CircuitBreakerOptions,
} from '@cue/observability/reliability';
import type { CueContext } from '../types.js';
import type { CueStreamOverrides } from '../llm/claude-cue-client.js';
import { DegradationController } from './degradation.js';

/** The LLM streaming surface this wrapper drives (satisfied by ClaudeCueClient). */
export interface CueLlmClient {
  streamCue(
    context: CueContext,
    signal?: AbortSignal,
    overrides?: CueStreamOverrides,
  ): AsyncGenerator<CueEvent>;
}

/** Re-thrown so the breaker counts an inner `{kind:'error'}` frame as a failure. */
export class LlmProviderError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'LlmProviderError';
  }
}

/** Construction options for {@link ResilientCueClient}. */
export interface ResilientCueOptions {
  /** The underlying Claude cue client. */
  client: CueLlmClient;
  /** Shared degradation ladder (also driven by the STT wrapper). */
  degradation: DegradationController;
  /** Breaker tuning override (name defaults to `claude-live`). */
  breaker?: Partial<CircuitBreakerOptions>;
  /**
   * TTFT above this (ms) but below the breaker timeout steps the ladder to
   * `reduced` (shorten max_tokens, throttle). Default 900 (server-latency SLO).
   */
  slowTtftMs?: number;
  /** Injectable clock for TTFT measurement. Default `Date.now`. */
  now?: () => number;
}

export class ResilientCueClient {
  private readonly client: CueLlmClient;
  private readonly degradation: DegradationController;
  private readonly breaker: CircuitBreaker;
  private readonly slowTtftMs: number;
  private readonly now: () => number;

  constructor(options: ResilientCueOptions) {
    this.client = options.client;
    this.degradation = options.degradation;
    this.slowTtftMs = options.slowTtftMs ?? 900;
    this.now = options.now ?? Date.now;
    this.breaker = new CircuitBreaker({
      name: 'claude-live',
      failureThreshold: 4,
      successThreshold: 1,
      openMs: 5_000,
      timeoutMs: 4_000,
      onStateChange: (t) => {
        // Breaker open => shed (pause auto-cues); half-open probe => reduced;
        // fully closed => back to normal.
        if (t.to === 'open') this.degradation.setLlm('shedding');
        else if (t.to === 'half-open') this.degradation.setLlm('reduced');
      },
      ...options.breaker,
    });
  }

  /** Current breaker state, for metrics/logging. */
  get circuitState(): string {
    return this.breaker.currentState;
  }

  /**
   * Stream one cue under the breaker + degradation ladder. Yields the same
   * {@link CueEvent} frames as the inner client on the healthy path. On the
   * shedding step (or an open breaker) it yields nothing — auto-cues are paused
   * while the transcript ribbon keeps flowing upstream.
   */
  async *streamCue(context: CueContext, signal?: AbortSignal): AsyncGenerator<CueEvent> {
    const tuning = this.degradation.tuning();
    // Ladder step 3: auto-cues paused. Emit nothing; the transcript stays live.
    if (!tuning.autoCuesEnabled) return;
    // Fast-fail while open rather than hanging on a dead dependency.
    if (this.breaker.currentState === 'open') {
      this.degradation.setLlm('shedding');
      return;
    }

    // Chain a local controller so a TTFT timeout also aborts the abandoned
    // upstream stream (no orphaned Anthropic request).
    const ac = new AbortController();
    const onParentAbort = (): void => ac.abort();
    if (signal) {
      if (signal.aborted) return;
      signal.addEventListener('abort', onParentAbort, { once: true });
    }

    const iterator = this.client
      .streamCue(context, ac.signal, { maxTokens: tuning.maxTokens })
      [Symbol.asyncIterator]();

    try {
      const startedAt = this.now();
      let first: IteratorResult<CueEvent>;
      try {
        first = await this.breaker.execute(async () => {
          const result = await iterator.next();
          if (!result.done && result.value.kind === 'error') {
            throw new LlmProviderError(result.value.text ?? 'llm error');
          }
          return result;
        });
      } catch (err) {
        // Breaker faults => shed and drop this cue (live path: no retry).
        if (err instanceof CircuitOpenError || err instanceof CircuitTimeoutError) {
          this.degradation.setLlm('shedding');
        }
        ac.abort();
        return;
      }

      // First token arrived: adjust the ladder by observed TTFT.
      this.classifyTtft(this.now() - startedAt);

      if (first.done) return;
      yield first.value;

      for (;;) {
        if (ac.signal.aborted) return;
        const result = await iterator.next();
        if (result.done) return;
        yield result.value;
      }
    } finally {
      if (signal) signal.removeEventListener('abort', onParentAbort);
      // Ensure the inner generator is released if the consumer stops early.
      void iterator.return?.(undefined);
    }
  }

  /** Move between `normal` and `reduced` based on observed first-token latency. */
  private classifyTtft(ttftMs: number): void {
    if (this.degradation.llm === 'shedding') return; // recovery is breaker-driven
    this.degradation.setLlm(ttftMs > this.slowTtftMs ? 'reduced' : 'normal');
  }
}
