/**
 * Wire (de)serialization for the `cue.v1` WS protocol (docs/22 §5.3).
 *
 * Two channels over one socket:
 *   - binary frames = audio ingest  (client → server): 4-byte LE header + payload
 *   - text frames   = JSON control  (both ways): {@link ClientMsg}/{@link ServerMsg}
 *
 * The binary header layout is shared verbatim with `desktop` via
 * {@link WS_AUDIO_FRAME} so both ends encode/decode against one constant set.
 */
import { WS_AUDIO_FRAME, type ClientMsg, type ServerMsg } from '@cue/types';
import type { DecodedAudioFrame } from '../types.js';

/** Parse a JSON text frame into a {@link ClientMsg}. Returns null if malformed. */
export function parseControl(raw: string): ClientMsg | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const t = (value as { t?: unknown }).t;
  if (typeof t !== 'string') return null;
  // The server validates fields per-branch downstream; here we only assert the
  // discriminant is present so the dispatcher can switch safely.
  return value as ClientMsg;
}

/** Serialize a {@link ServerMsg} to a JSON text frame. */
export function encodeControl(msg: ServerMsg): string {
  return JSON.stringify(msg);
}

/**
 * Decode a binary audio frame. Returns null if the buffer is too short to hold
 * the 4-byte header (malformed → dropped, never fatal).
 */
export function decodeAudioFrame(data: Buffer): DecodedAudioFrame | null {
  if (data.length < WS_AUDIO_FRAME.HEADER_BYTES) return null;
  return {
    type: data.readUInt8(0),
    channel: data.readUInt8(1),
    sequence: data.readUInt16LE(2),
    payload: data.subarray(WS_AUDIO_FRAME.HEADER_BYTES),
  };
}
