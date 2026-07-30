/**
 * Pure mappings between the gRPC wire types (`@cue/proto`) and the in-process
 * pipeline types (`@cue/types`) consumed/produced by `@cue/core`.
 *
 * Stateless by design: sequence numbers are owned by the per-stream session
 * (see stream-session.ts) and passed in, so these functions stay testable and
 * side-effect free.
 */
import type {
  AudioChunk as ProtoAudioChunk,
  AudioFormat,
  CueKind as ProtoCueKind,
  ServerEnvelope,
  SessionState as ProtoSessionState,
  Speaker as ProtoSpeaker,
  TranscriptKind as ProtoTranscriptKind,
} from '@cue/proto';
import type {
  AudioChunk as CoreAudioChunk,
  CueEvent,
  SessionState as CoreSessionState,
  TranscriptEvent,
} from '@cue/types';

/** Phase 0 capture defaults (16 kHz mono linear16) when StartSession omits format. */
const DEFAULT_SAMPLE_RATE = 16_000;
const DEFAULT_CHANNELS = 1;

/** `@cue/core` has no per-event speaker; live audio is the other party. */
const DEFAULT_SPEAKER: ProtoSpeaker = 'THEM';
/** Only HAIKU_4_5 runs on the live path in Phase 1. */
const LIVE_MODEL = 'HAIKU_4_5' as const;

const STATE_MAP: Record<CoreSessionState, ProtoSessionState> = {
  idle: 'IDLE',
  listening: 'LISTENING',
  thinking: 'THINKING',
  cue: 'CUE',
  error: 'ERROR',
};

const TRANSCRIPT_KIND_MAP: Record<TranscriptEvent['kind'], ProtoTranscriptKind> = {
  partial: 'PARTIAL',
  final: 'FINAL',
};

const CUE_KIND_MAP: Record<CueEvent['kind'], ProtoCueKind> = {
  delta: 'DELTA',
  done: 'DONE',
  none: 'NONE',
  error: 'CUE_ERROR',
};

/** Map an inbound proto AudioChunk into the core pipeline's PCM chunk. */
export function toCoreAudioChunk(
  chunk: ProtoAudioChunk,
  format: AudioFormat | undefined,
): CoreAudioChunk {
  return {
    data: toArrayBuffer(chunk.payload),
    sampleRate: format?.sampleRate ?? DEFAULT_SAMPLE_RATE,
    channels: format?.channels ?? DEFAULT_CHANNELS,
    ts: chunk.capturedAtMs,
  };
}

/** Wrap a core state transition as a downstream ServerEnvelope. */
export function toServerState(state: CoreSessionState): ServerEnvelope {
  return {
    kind: 'state',
    state: { state: STATE_MAP[state], detail: '', resumedFromSeq: 0 },
  };
}

/**
 * Wrap a core transcript event as a downstream ServerEnvelope.
 * `seq` is monotonic and meaningful on FINAL results (resume offset).
 */
export function toServerTranscript(event: TranscriptEvent, seq: number): ServerEnvelope {
  return {
    kind: 'transcript',
    transcript: {
      kind: TRANSCRIPT_KIND_MAP[event.kind],
      speaker: DEFAULT_SPEAKER,
      text: event.text,
      seq,
      startMs: event.ts,
      endMs: event.ts,
      tsMs: event.ts,
      confidence: 0, // core STT does not surface a confidence score in Phase 0/1.
    },
  };
}

/**
 * Wrap a core cue event as a downstream ServerEnvelope.
 * `seq` is meaningful on DONE (resume offset); `id` groups a cue's events.
 */
export function toServerCue(event: CueEvent, seq: number): ServerEnvelope {
  return {
    kind: 'cue',
    cue: {
      kind: CUE_KIND_MAP[event.kind],
      id: event.id,
      text: event.text ?? '',
      seq,
      model: LIVE_MODEL,
    },
  };
}

/** Copy the payload's bytes into a standalone ArrayBuffer (respecting view offset). */
function toArrayBuffer(payload: Buffer | Uint8Array): ArrayBuffer {
  return payload.buffer.slice(
    payload.byteOffset,
    payload.byteOffset + payload.byteLength,
  ) as ArrayBuffer;
}
