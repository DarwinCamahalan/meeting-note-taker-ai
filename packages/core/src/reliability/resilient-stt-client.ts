/**
 * Resilient wrapper around a streaming STT client (docs/70-scalability §5.1
 * circuit breakers, §5.2 STT stream reconnect, §5.3 ladder steps 4-5).
 *
 * Responsibilities layered on top of a raw {@link SttClient}:
 *  - wrap `start()` in a circuit breaker so a dead provider fails fast instead
 *    of hanging the session bootstrap;
 *  - on an unexpected mid-session socket error/close, reconnect with bounded
 *    exponential backoff (a fresh underlying client per attempt), buffering
 *    audio in-process only briefly — never unbounded;
 *  - when reconnect is exhausted (or the breaker is open), declare STT
 *    `unavailable`: capture keeps running locally (audio is accepted and
 *    dropped) and the orchestrator pauses cues, per the ladder.
 *
 * There is one STT provider wired today (Deepgram). AssemblyAI failover is a
 * documented seam: {@link SttClientFactory} can round-robin providers, and the
 * `failover` degradation level is reserved for that transparent hand-off.
 */
import type { AudioChunk, TranscriptEvent } from '@cue/types';
import {
  CircuitBreaker,
  CircuitOpenError,
  retry,
  type CircuitBreakerOptions,
} from '@cue/observability/reliability';
import type { SttDegradation } from './degradation.js';

/** The streaming-STT surface this wrapper drives (satisfied by DeepgramSttClient). */
export interface SttClient {
  start(): Promise<void>;
  stop(): Promise<void>;
  pushAudio(chunk: AudioChunk): void;
  onTranscript(cb: (t: TranscriptEvent) => void): void;
  onError(cb: (err: unknown) => void): void;
  onClose(cb: () => void): void;
}

/** Mints a fresh, unstarted {@link SttClient} for a (re)connect attempt. */
export type SttClientFactory = () => SttClient;

/** Construction options for {@link ResilientSttClient}. */
export interface ResilientSttOptions {
  /** Factory for underlying clients — one per connect/reconnect attempt. */
  factory: SttClientFactory;
  /** Breaker tuning override (name defaults to `deepgram-stt`). */
  breaker?: Partial<CircuitBreakerOptions>;
  /** Max reconnect attempts on a mid-session drop before declaring unavailable. Default 4. */
  maxReconnectAttempts?: number;
  /** Base reconnect backoff (ms). Default 250. */
  reconnectBaseMs?: number;
  /** Reconnect backoff cap (ms) — the bounded audio window (70 §5.2). Default 2000. */
  reconnectCapMs?: number;
  /** Fired whenever the STT degradation level changes. */
  onDegradation?: (level: SttDegradation) => void;
}

export class ResilientSttClient implements SttClient {
  private readonly factory: SttClientFactory;
  private readonly breaker: CircuitBreaker;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectBaseMs: number;
  private readonly reconnectCapMs: number;
  private readonly onDegradation: ((level: SttDegradation) => void) | undefined;

  private client: SttClient | undefined;
  private transcriptCb: ((t: TranscriptEvent) => void) | undefined;
  private errorCb: ((err: unknown) => void) | undefined;
  private closeCb: (() => void) | undefined;

  private started = false;
  private stopping = false;
  private reconnecting = false;
  private level: SttDegradation = 'primary';

  constructor(options: ResilientSttOptions) {
    this.factory = options.factory;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 4;
    this.reconnectBaseMs = options.reconnectBaseMs ?? 250;
    this.reconnectCapMs = options.reconnectCapMs ?? 2_000;
    this.onDegradation = options.onDegradation;
    this.breaker = new CircuitBreaker({
      name: 'deepgram-stt',
      failureThreshold: 3,
      openMs: 5_000,
      timeoutMs: 4_000,
      ...options.breaker,
    });
  }

  /** Current STT degradation level. */
  get degradation(): SttDegradation {
    return this.level;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.stopping = false;
    try {
      await this.connectOnce();
      this.setLevel('primary');
    } catch (err) {
      this.started = false;
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.started = false;
    this.stopping = true;
    this.reconnecting = false;
    const client = this.client;
    this.client = undefined;
    if (client) await client.stop();
    this.setLevel('primary');
    // Notify subscribers of the terminal close (caller-initiated teardown).
    this.closeCb?.();
  }

  pushAudio(chunk: AudioChunk): void {
    // While unavailable, capture keeps running locally but has nowhere to go.
    // Buffering here is bounded by the underlying client's own pending cap.
    this.client?.pushAudio(chunk);
  }

  onTranscript(cb: (t: TranscriptEvent) => void): void {
    this.transcriptCb = cb;
  }

  onError(cb: (err: unknown) => void): void {
    this.errorCb = cb;
  }

  onClose(cb: () => void): void {
    this.closeCb = cb;
  }

  /** Build + start a single underlying client, wiring its event sinks. */
  private async connectOnce(): Promise<void> {
    const client = this.factory();
    client.onTranscript((t) => this.transcriptCb?.(t));
    client.onError((err) => this.handleDrop(err));
    client.onClose(() => this.handleDrop());
    await this.breaker.execute(() => client.start());
    this.client = client;
  }

  /**
   * Handle an unexpected socket error/close. Ignored when we initiated the stop
   * or a reconnect is already in flight; otherwise kicks off bounded reconnect.
   */
  private handleDrop(err?: unknown): void {
    if (this.stopping || !this.started || this.reconnecting) return;
    if (err) this.errorCb?.(err);
    void this.reconnect();
  }

  private async reconnect(): Promise<void> {
    this.reconnecting = true;
    this.setLevel('failover');
    this.client = undefined;
    try {
      await retry(() => this.connectOnce(), {
        maxAttempts: this.maxReconnectAttempts,
        baseMs: this.reconnectBaseMs,
        capMs: this.reconnectCapMs,
        // The breaker being open is terminal for this window — stop retrying.
        isRetryable: (e) => !(e instanceof CircuitOpenError),
      });
      if (this.started && !this.stopping) this.setLevel('primary');
    } catch {
      // Exhausted (or breaker open): both providers effectively down. Capture
      // continues locally; cues pause (orchestrator reads transcriptionAvailable).
      this.setLevel('unavailable');
    } finally {
      this.reconnecting = false;
    }
  }

  private setLevel(level: SttDegradation): void {
    if (level === this.level) return;
    this.level = level;
    this.onDegradation?.(level);
  }
}
