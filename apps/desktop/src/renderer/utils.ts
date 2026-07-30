import type { SessionState } from '@cue/types';

/**
 * Pure helpers for the renderer: audio format conversion and small view
 * formatters. No React, no side effects — trivially unit-testable.
 */

/** Deepgram is configured for 16 kHz mono linear16 (see @cue/core stt). */
export const TARGET_SAMPLE_RATE = 16_000;
export const TARGET_CHANNELS = 1;

/**
 * Linearly resample a mono Float32 frame to {@link TARGET_SAMPLE_RATE}.
 * The capture graph usually already runs at 16 kHz (we request it on the
 * AudioContext), so this is a cheap identity pass in the common case.
 */
export function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === TARGET_SAMPLE_RATE || input.length === 0) {
    return input;
  }
  const ratio = inputRate / TARGET_SAMPLE_RATE;
  const outLength = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLength);
  const lastIdx = input.length - 1;
  for (let i = 0; i < outLength; i += 1) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, lastIdx);
    const frac = pos - i0;
    const a = input[i0] ?? 0;
    const b = input[i1] ?? 0;
    out[i] = a * (1 - frac) + b * frac;
  }
  return out;
}

/**
 * Convert a Float32 PCM frame in [-1, 1] to little-endian linear16, returning
 * the backing ArrayBuffer ready for an {@link AudioChunk}.
 */
export function floatToPcm16(input: Float32Array): ArrayBuffer {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, input[i] ?? 0));
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return out.buffer;
}

/** Human-readable label for each session state, for the status pill. */
export function stateLabel(state: SessionState): string {
  switch (state) {
    case 'idle':
      return 'Idle';
    case 'listening':
      return 'Listening';
    case 'thinking':
      return 'Thinking';
    case 'cue':
      return 'Cue';
    case 'error':
      return 'Error';
    default:
      return state;
  }
}
