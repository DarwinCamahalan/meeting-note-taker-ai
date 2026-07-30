/**
 * Typed circuit breaker for external-provider calls (per 70-scalability §5.1
 * "Circuit breakers"). Every external dependency call from `ai-orchestrator`
 * (Claude, STT, embeddings) is wrapped in one: closed → open → half-open.
 *
 * On OPEN the breaker fails fast with {@link CircuitOpenError} so the caller can
 * run its graceful-degradation ladder (shorter cues → drop low-value cues →
 * pause auto-cues) instead of hanging on a dead dependency. The live-cue path
 * pairs this with NO retries (see backoff.ts) — a retried cue is a late cue.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Human name for logs/metrics (e.g. `claude-live`, `deepgram-stt`). */
  name: string;
  /** Consecutive failures in `closed` that trip the breaker `open`. Default 5. */
  failureThreshold?: number;
  /** Consecutive successes in `half-open` that close the breaker. Default 2. */
  successThreshold?: number;
  /** How long to stay `open` before probing `half-open`, in ms. Default 5000. */
  openMs?: number;
  /** Per-call timeout in ms; a timeout counts as a failure. Default: no timeout. */
  timeoutMs?: number;
  /** Classify a thrown error as a breaker failure. Default: every throw counts. */
  isFailure?: (error: unknown) => boolean;
  /** Observability hook fired on every state transition. */
  onStateChange?: (transition: CircuitTransition) => void;
  /** Injectable clock for deterministic tests. Default `Date.now`. */
  now?: () => number;
}

export interface CircuitTransition {
  readonly name: string;
  readonly from: CircuitState;
  readonly to: CircuitState;
  readonly at: number;
}

/** Thrown by {@link CircuitBreaker.execute} while the breaker is open. */
export class CircuitOpenError extends Error {
  readonly circuit: string;
  constructor(circuit: string) {
    super(`circuit "${circuit}" is open`);
    this.name = 'CircuitOpenError';
    this.circuit = circuit;
  }
}

/** Thrown when a wrapped call exceeds `timeoutMs`. */
export class CircuitTimeoutError extends Error {
  readonly circuit: string;
  constructor(circuit: string, timeoutMs: number) {
    super(`circuit "${circuit}" call timed out after ${timeoutMs}ms`);
    this.name = 'CircuitTimeoutError';
    this.circuit = circuit;
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private openedAt = 0;

  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly openMs: number;
  private readonly timeoutMs: number | undefined;
  private readonly isFailure: (error: unknown) => boolean;
  private readonly onStateChange: ((t: CircuitTransition) => void) | undefined;
  private readonly now: () => number;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 2;
    this.openMs = options.openMs ?? 5000;
    this.timeoutMs = options.timeoutMs;
    this.isFailure = options.isFailure ?? (() => true);
    this.onStateChange = options.onStateChange;
    this.now = options.now ?? Date.now;
  }

  /** Current state, after applying any pending open→half-open time transition. */
  get currentState(): CircuitState {
    this.maybeHalfOpen();
    return this.state;
  }

  /**
   * Run `fn` under the breaker. Throws {@link CircuitOpenError} immediately when
   * open; otherwise runs it, recording success/failure and transitioning state.
   * Errors that {@link CircuitBreakerOptions.isFailure} rejects pass through
   * WITHOUT counting against the breaker (e.g. a 4xx validation error).
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeHalfOpen();
    if (this.state === 'open') throw new CircuitOpenError(this.name);

    try {
      const result = this.timeoutMs === undefined ? await fn() : await this.withTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      if (error instanceof CircuitTimeoutError || this.isFailure(error)) {
        this.onFailure();
      }
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) this.transition('closed');
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    if (this.state === 'half-open') {
      // A probe failed — reopen immediately.
      this.transition('open');
      return;
    }
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) this.transition('open');
  }

  /** Move open→half-open once the cooldown has elapsed. */
  private maybeHalfOpen(): void {
    if (this.state === 'open' && this.now() - this.openedAt >= this.openMs) {
      this.transition('half-open');
    }
  }

  private transition(to: CircuitState): void {
    if (to === this.state) return;
    const from = this.state;
    this.state = to;
    if (to === 'open') this.openedAt = this.now();
    if (to === 'closed') this.failureCount = 0;
    if (to === 'half-open' || to === 'closed') this.successCount = 0;
    this.onStateChange?.({ name: this.name, from, to, at: this.now() });
  }

  private async withTimeout<T>(fn: () => Promise<T>): Promise<T> {
    const timeoutMs = this.timeoutMs as number;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new CircuitTimeoutError(this.name, timeoutMs)), timeoutMs);
    });
    try {
      return await Promise.race([fn(), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
