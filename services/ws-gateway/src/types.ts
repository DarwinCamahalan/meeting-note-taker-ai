/**
 * Internal types for the gateway. Wire contracts come from @cue/types (WS) and
 * @cue/proto (gRPC); these are the small glue shapes the modules share.
 */
import type { ServerMsg } from '@cue/types';

/**
 * A buffered `*.final` frame retained for resume replay. We store the exact
 * outbound {@link ServerMsg} plus its `seq` so replay is a verbatim re-send.
 */
export interface OutboundFinal {
  seq: number;
  msg: Extract<ServerMsg, { t: 'transcript.final' } | { t: 'cue.final' }>;
}

/** A decoded binary audio frame (header stripped, per WS_AUDIO_FRAME layout). */
export interface DecodedAudioFrame {
  /** 0x01 opus | 0x02 pcm16 (frame type byte). */
  type: number;
  /** 0x00 mixed | 0x01 mic | 0x02 loopback (channel byte). */
  channel: number;
  /** uint16 sequence from the header (wraps; used for gap detection). */
  sequence: number;
  /** The codec payload (Opus packet or PCM16 LE chunk). */
  payload: Buffer;
}
