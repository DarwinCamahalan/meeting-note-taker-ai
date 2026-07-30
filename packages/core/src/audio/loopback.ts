import type { AudioChunk } from '@cue/types';

/**
 * System-audio loopback capture — the OTHER party's audio (e.g. the far side
 * of a video call).
 *
 * Phase 0 does NOT implement real capture. Real capture requires native
 * platform bindings and is gated behind the descoped consent /
 * recording-disclosure work:
 *   - macOS:   ScreenCaptureKit audio, or Core Audio process taps (macOS 14.4+)
 *   - Windows: WASAPI loopback capture
 *
 * The WORKING Phase 0 audio path is microphone capture, which lives in the
 * renderer (getUserMedia -> AudioWorklet -> window.cue.sendAudioChunk), not
 * here. Mic-only is sufficient to prove the end-to-end thread.
 */
export interface LoopbackCapture {
  /** Whether real loopback capture is available on this platform/build. */
  readonly isSupported: boolean;
  /** Begin capturing system audio; each PCM chunk is delivered to `onChunk`. */
  start(onChunk: (chunk: AudioChunk) => void): Promise<void>;
  /** Stop capturing and release native resources. */
  stop(): Promise<void>;
}

/**
 * Not-yet-implemented loopback source. Reports `isSupported = false` so callers
 * can gracefully skip it, and throws on `start()` to make accidental use loud
 * rather than silently emitting nothing.
 */
export class NotImplementedLoopbackCapture implements LoopbackCapture {
  readonly isSupported = false;

  async start(_onChunk: (chunk: AudioChunk) => void): Promise<void> {
    // TODO(descoped): implement native ScreenCaptureKit (macOS) / WASAPI
    // loopback (Windows) bindings. Requires consent + recording-disclosure
    // work before it can ship. Mic-only path (renderer) covers Phase 0.
    throw new Error(
      'Loopback (system-audio) capture is not implemented in Phase 0. ' +
        'It requires native bindings gated behind the descoped consent work.',
    );
  }

  async stop(): Promise<void> {
    // No-op: nothing was ever started.
  }
}
