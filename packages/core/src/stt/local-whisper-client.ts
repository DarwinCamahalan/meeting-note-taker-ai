import type { AudioChunk, TranscriptEvent } from '@cue/types';

/**
 * Local, FREE, offline speech-to-text via whisper.cpp (the `smart-whisper`
 * native addon) — no API key, no cloud. Metal-accelerated on Apple Silicon,
 * CPU elsewhere. A drop-in {@link SttClient} (structural) alongside the
 * Deepgram client; selected by `sttProvider: 'local-whisper'`.
 *
 * Whisper is not a streaming model — it transcribes a buffer — so we simulate
 * streaming: accumulate 16 kHz mono PCM, re-transcribe the in-progress
 * utterance every `intervalMs` (emitting `partial`), and finalize (emit
 * `final`, reset) when we detect trailing silence (energy VAD) or the utterance
 * grows past `maxUtteranceMs`. `smart-whisper` is loaded via dynamic import so
 * the native addon is only required when this provider is actually used.
 */

const SAMPLE_RATE = 16_000;
/** RMS below this (on [-1,1] samples) counts as silence for the VAD. */
const SILENCE_RMS = 0.008;
/** How often the finalize/interim decision runs. */
const TICK_MS = 250;

export interface LocalWhisperOptions {
  /** ggml model name (`tiny.en`, `base.en`, `small.en`, …) or an absolute .bin path. Default `base.en`. */
  model?: string;
  /** Use GPU (Metal/CUDA) when available. Default true. */
  gpu?: boolean;
  /** Transcription language (ISO-639-1). Default `en`. */
  language?: string;
  /** Cadence for interim (`partial`) re-transcription. Default 1500 ms. */
  intervalMs?: number;
  /** Trailing silence that finalizes the current utterance. Default 700 ms. */
  silenceMs?: number;
  /** Hard cap on an utterance before a forced finalize. Default 20000 ms. */
  maxUtteranceMs?: number;
  /** Ignore buffers shorter than this (avoids transcribing a cough). Default 400 ms. */
  minSpeechMs?: number;
}

/** Minimal structural view of the `smart-whisper` surface we depend on. */
interface WhisperTask {
  result: Promise<ReadonlyArray<{ text: string }>>;
}
interface WhisperInstance {
  transcribe(pcm: Float32Array, params?: Record<string, unknown>): Promise<WhisperTask>;
  free(): Promise<void>;
}
/** whisper.cpp model manager (download/resolve/check by name). */
interface SmartWhisperManager {
  check(model: string): boolean;
  download(model: string): Promise<string>;
  resolve(model: string): string;
}
interface SmartWhisperModule {
  Whisper: new (file: string, config?: { gpu?: boolean }) => WhisperInstance;
  manager: SmartWhisperManager;
}

/** A model string that points at a file on disk rather than a named model. */
function isModelPath(model: string): boolean {
  return model.includes('/') || model.endsWith('.bin');
}

export class LocalWhisperSttClient {
  private readonly model: string;
  private readonly gpu: boolean;
  private readonly language: string;
  private readonly intervalMs: number;
  private readonly silenceMs: number;
  private readonly maxUtteranceMs: number;
  private readonly minSpeechMs: number;

  private whisper: WhisperInstance | undefined;
  private transcriptCb: ((t: TranscriptEvent) => void) | undefined;
  private errorCb: ((err: unknown) => void) | undefined;
  private closeCb: (() => void) | undefined;

  /** Growable mono Float32 ring for the in-progress utterance. */
  private buffer = new Float32Array(SAMPLE_RATE * 30);
  private bufLen = 0;
  private trailingSilenceMs = 0;
  private lastInterimMs = 0;
  private busy = false;
  private started = false;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(options: LocalWhisperOptions = {}) {
    this.model = options.model ?? 'base.en';
    this.gpu = options.gpu ?? true;
    this.language = options.language ?? 'en';
    this.intervalMs = options.intervalMs ?? 1_500;
    this.silenceMs = options.silenceMs ?? 700;
    this.maxUtteranceMs = options.maxUtteranceMs ?? 20_000;
    this.minSpeechMs = options.minSpeechMs ?? 400;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      const sw = (await import('smart-whisper')) as unknown as SmartWhisperModule;
      let modelPath: string;
      if (isModelPath(this.model)) {
        modelPath = this.model;
      } else {
        // Named model: download on first use (cached), then resolve to a path.
        if (!sw.manager.check(this.model)) {
          await sw.manager.download(this.model);
        }
        modelPath = sw.manager.resolve(this.model);
      }
      this.whisper = new sw.Whisper(modelPath, { gpu: this.gpu });
    } catch (err) {
      this.started = false;
      this.emitError(err);
      return;
    }
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    const whisper = this.whisper;
    this.whisper = undefined;
    this.started = false;
    this.resetBuffer();
    if (whisper) {
      try {
        await whisper.free();
      } catch {
        /* model already released */
      }
    }
    this.closeCb?.();
  }

  /** Append a captured linear16 chunk and update the silence tracker. */
  pushAudio(chunk: AudioChunk): void {
    const int16 = new Int16Array(chunk.data);
    if (int16.length === 0) return;
    this.ensureCapacity(int16.length);

    let sumSq = 0;
    for (let i = 0; i < int16.length; i += 1) {
      const f = (int16[i] ?? 0) / 32_768;
      this.buffer[this.bufLen + i] = f;
      sumSq += f * f;
    }
    this.bufLen += int16.length;

    const rms = Math.sqrt(sumSq / int16.length);
    const chunkMs = (int16.length / SAMPLE_RATE) * 1_000;
    this.trailingSilenceMs = rms < SILENCE_RMS ? this.trailingSilenceMs + chunkMs : 0;
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

  /** Flush the current utterance as a `final` (e.g. on session stop). */
  async flush(): Promise<void> {
    if (this.bufLen > 0 && !this.busy) {
      await this.transcribeCurrent(true);
    }
  }

  private async tick(): Promise<void> {
    if (this.busy || !this.whisper || this.bufLen === 0) return;
    const bufMs = (this.bufLen / SAMPLE_RATE) * 1_000;
    if (bufMs < this.minSpeechMs) return;

    const shouldFinalize = this.trailingSilenceMs >= this.silenceMs || bufMs >= this.maxUtteranceMs;
    const interimDue = bufMs - this.lastInterimMs >= this.intervalMs;
    if (!shouldFinalize && !interimDue) return;

    await this.transcribeCurrent(shouldFinalize);
  }

  private async transcribeCurrent(finalize: boolean): Promise<void> {
    const whisper = this.whisper;
    if (!whisper || this.bufLen === 0) return;
    this.busy = true;
    // Copy: the native call reads async while pushAudio may keep appending.
    const pcm = this.buffer.slice(0, this.bufLen);
    try {
      const task = await whisper.transcribe(pcm, {
        language: this.language,
        no_timestamps: true,
        suppress_non_speech_tokens: true,
      });
      const text = (await task.result)
        .map((s) => s.text)
        .join('')
        .trim();
      if (text.length > 0) {
        this.transcriptCb?.({ kind: finalize ? 'final' : 'partial', text, ts: Date.now() });
      }
      if (finalize) {
        this.resetBuffer();
      } else {
        this.lastInterimMs = (this.bufLen / SAMPLE_RATE) * 1_000;
      }
    } catch (err) {
      this.emitError(err);
    } finally {
      this.busy = false;
    }
  }

  private ensureCapacity(extra: number): void {
    const need = this.bufLen + extra;
    if (need <= this.buffer.length) return;
    const grown = new Float32Array(Math.max(need, this.buffer.length * 2));
    grown.set(this.buffer.subarray(0, this.bufLen));
    this.buffer = grown;
  }

  private resetBuffer(): void {
    this.bufLen = 0;
    this.trailingSilenceMs = 0;
    this.lastInterimMs = 0;
  }

  private emitError(err: unknown): void {
    if (this.errorCb) this.errorCb(err);
    else console.error('[cue][local-whisper]', err);
  }
}
