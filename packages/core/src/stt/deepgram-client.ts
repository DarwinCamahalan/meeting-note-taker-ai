import {
  createClient,
  LiveTranscriptionEvents,
} from '@deepgram/sdk';
import type {
  DeepgramClient,
  ListenLiveClient,
  LiveSchema,
} from '@deepgram/sdk';
import type { AudioChunk, TranscriptEvent } from '@cue/types';

/** Construction options for the Deepgram streaming STT client. */
export interface DeepgramSttOptions {
  apiKey: string;
  /** Override the model id; defaults to the Phase 0 target. */
  model?: string;
}

/** Live-transcription schema per the Phase 0 spec (16 kHz mono linear16). */
const LIVE_SCHEMA: LiveSchema = {
  model: 'nova-2',
  interim_results: true,
  endpointing: 300,
  encoding: 'linear16',
  sample_rate: 16000,
  channels: 1,
};

/** WebSocket readyState for an open connection. */
const SOCKET_OPEN = 1;

/** Cap on audio buffered before the socket opens, to bound memory. */
const MAX_PENDING_CHUNKS = 200;

/**
 * The relevant subset of a Deepgram `Results` payload. Typed locally so the
 * client does not depend on the exact SDK payload type-name across versions.
 */
interface DeepgramTranscriptResult {
  readonly is_final?: boolean;
  readonly speech_final?: boolean;
  readonly channel?: {
    readonly alternatives?: ReadonlyArray<{ readonly transcript?: string }>;
  };
}

/**
 * Streaming speech-to-text over Deepgram's live-transcription websocket.
 *
 * Feeds {@link AudioChunk.data} (linear16 PCM) onto the socket and emits
 * `partial` / `final` {@link TranscriptEvent}s. Open/close/error are handled;
 * audio received before the socket opens is briefly queued and flushed on open.
 */
export class DeepgramSttClient {
  private readonly client: DeepgramClient;
  private readonly model: string;

  private connection: ListenLiveClient | undefined;
  private transcriptCb: ((t: TranscriptEvent) => void) | undefined;
  private errorCb: ((err: unknown) => void) | undefined;
  private closeCb: (() => void) | undefined;

  /** PCM buffered while the socket is still opening. */
  private readonly pending: ArrayBuffer[] = [];
  private isOpen = false;

  constructor(options: DeepgramSttOptions) {
    this.client = createClient(options.apiKey);
    this.model = options.model ?? LIVE_SCHEMA.model ?? 'nova-2';
  }

  /** Open the live socket and wire up its event handlers. */
  async start(): Promise<void> {
    if (this.connection) return;

    const connection = this.client.listen.live({ ...LIVE_SCHEMA, model: this.model });
    this.connection = connection;

    connection.on(LiveTranscriptionEvents.Open, () => {
      this.isOpen = true;
      this.flushPending();
    });

    connection.on(LiveTranscriptionEvents.Transcript, (data: DeepgramTranscriptResult) => {
      this.handleTranscript(data);
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
      this.isOpen = false;
      this.closeCb?.();
    });

    connection.on(LiveTranscriptionEvents.Error, (err: unknown) => {
      this.isOpen = false;
      // Surface to the reliability layer (reconnect/failover). Kept quiet on the
      // console when a handler is registered so the resilient wrapper owns logging.
      if (this.errorCb) this.errorCb(err);
      else console.error('[cue][deepgram] live error:', err);
    });
  }

  /** Gracefully finish and tear down the live socket. */
  async stop(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;
    this.isOpen = false;
    this.pending.length = 0;
    if (!connection) return;

    // `requestClose` (SDK >=3.4) supersedes the older `finish`; support both.
    const closable = connection as unknown as {
      requestClose?: () => void;
      finish?: () => void;
    };
    if (typeof closable.requestClose === 'function') {
      closable.requestClose();
    } else if (typeof closable.finish === 'function') {
      closable.finish();
    }
  }

  /** Forward a captured PCM chunk to the socket (buffering until open). */
  pushAudio(chunk: AudioChunk): void {
    const connection = this.connection;
    if (connection && this.isOpen && connection.getReadyState() === SOCKET_OPEN) {
      connection.send(chunk.data);
      return;
    }
    if (this.pending.length < MAX_PENDING_CHUNKS) {
      this.pending.push(chunk.data);
    }
  }

  /** Register the transcript sink (last-writer-wins). */
  onTranscript(cb: (t: TranscriptEvent) => void): void {
    this.transcriptCb = cb;
  }

  /**
   * Register a sink for live-socket errors (last-writer-wins). The reliability
   * layer uses this to drive bounded reconnect / provider failover. Registering
   * a handler suppresses the default console error.
   */
  onError(cb: (err: unknown) => void): void {
    this.errorCb = cb;
  }

  /** Register a sink for socket close (last-writer-wins). */
  onClose(cb: () => void): void {
    this.closeCb = cb;
  }

  private flushPending(): void {
    const connection = this.connection;
    if (!connection) return;
    for (const data of this.pending) {
      connection.send(data);
    }
    this.pending.length = 0;
  }

  private handleTranscript(data: DeepgramTranscriptResult): void {
    const alternative = data.channel?.alternatives?.[0];
    const text = alternative?.transcript ?? '';
    if (text.trim().length === 0) return;

    this.transcriptCb?.({
      kind: data.is_final ? 'final' : 'partial',
      text,
      ts: Date.now(),
    });
  }
}
