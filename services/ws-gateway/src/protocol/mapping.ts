/**
 * 1:1 translation between the `cue.v1` WS envelopes (@cue/types) and the
 * orchestrator gRPC envelopes (@cue/proto). The gateway does transport only —
 * these pure functions are the entire semantic surface of that translation.
 */
import { WS_AUDIO_FRAME, type LiveModel, type ServerMsg, type Speaker } from '@cue/types';
import type {
  AudioChunk,
  Channel,
  Codec,
  Model,
  ServerEnvelope,
  SessionMode,
  Speaker as ProtoSpeaker,
} from '@cue/proto';
import type { DecodedAudioFrame } from '../types.js';

/* --------------------------- WS → gRPC (uplink) --------------------------- */

/** Map a `cue.v1` codec token to the proto {@link Codec} enum name. */
export function toProtoCodec(codec: 'opus' | 'pcm16'): Codec {
  return codec === 'opus' ? 'OPUS' : 'PCM16';
}

/**
 * Map a session-kind string (ticket `mode` claim, mirrors the `session_mode`
 * DB enum) to the proto {@link SessionMode}. Unknown/absent → UNSPECIFIED so
 * the orchestrator resolves the true mode from the session record.
 */
export function toProtoSessionMode(mode: string | undefined): SessionMode {
  switch (mode) {
    case 'interview_prep':
      return 'INTERVIEW_PREP';
    case 'interview_live':
      return 'INTERVIEW_LIVE';
    case 'sales':
      return 'SALES';
    case 'support':
      return 'SUPPORT';
    case 'meeting_notes':
      return 'MEETING_NOTES';
    default:
      return 'SESSION_MODE_UNSPECIFIED';
  }
}

function channelFromByte(byte: number): Channel {
  switch (byte) {
    case WS_AUDIO_FRAME.CHANNEL_MIC:
      return 'MIC';
    case WS_AUDIO_FRAME.CHANNEL_LOOPBACK:
      return 'LOOPBACK';
    case WS_AUDIO_FRAME.CHANNEL_MIXED:
      return 'MIXED';
    default:
      return 'CHANNEL_UNSPECIFIED';
  }
}

/** Build an {@link AudioChunk} from a decoded binary WS audio frame. */
export function toAudioChunk(frame: DecodedAudioFrame): AudioChunk {
  return {
    channel: channelFromByte(frame.channel),
    sequence: frame.sequence,
    payload: frame.payload,
    capturedAtMs: Date.now(),
  };
}

/* -------------------------- gRPC → WS (downlink) -------------------------- */

function toWsSpeaker(speaker: ProtoSpeaker): Speaker {
  if (speaker === 'THEM') return 'them';
  if (speaker === 'ME') return 'me';
  return 'unknown';
}

function toWsModel(model: Model): LiveModel {
  return model === 'SONNET_5' ? 'sonnet-5' : 'haiku-4-5';
}

/**
 * Translate one {@link ServerEnvelope} into zero or one {@link ServerMsg}.
 * Returns null for envelopes with no `cue.v1` representation (orchestrator-
 * internal `state`, `NONE`/error cue kinds) — those are logged, not relayed.
 */
export function toServerMsg(env: ServerEnvelope): ServerMsg | null {
  switch (env.kind) {
    case 'transcript': {
      const tr = env.transcript;
      if (tr.kind === 'PARTIAL') {
        return {
          t: 'transcript.partial',
          speaker: toWsSpeaker(tr.speaker),
          text: tr.text,
          ts: tr.tsMs,
        };
      }
      if (tr.kind === 'FINAL') {
        return {
          t: 'transcript.final',
          speaker: toWsSpeaker(tr.speaker),
          seq: tr.seq,
          text: tr.text,
          startMs: tr.startMs,
          endMs: tr.endMs,
        };
      }
      return null;
    }
    case 'cue': {
      const cue = env.cue;
      if (cue.kind === 'DELTA') {
        return { t: 'cue.delta', cueId: cue.id, text: cue.text };
      }
      if (cue.kind === 'DONE') {
        return {
          t: 'cue.final',
          cueId: cue.id,
          seq: cue.seq,
          text: cue.text,
          model: toWsModel(cue.model),
        };
      }
      // NONE (no cue warranted) and CUE_ERROR have no cue.v1 frame; the caller
      // logs CUE_ERROR. A transient cue failure must not tear down the session.
      return null;
    }
    case 'state':
      // Orchestrator lifecycle state (IDLE/LISTENING/THINKING/CUE/ERROR) is not
      // part of the cue.v1 surface; the gateway owns `ready`/heartbeat itself.
      // TODO(protocol): surface ERROR state as a client-facing frame once the
      // WsErrorCode union grows an UPSTREAM code.
      return null;
    default:
      return null;
  }
}
