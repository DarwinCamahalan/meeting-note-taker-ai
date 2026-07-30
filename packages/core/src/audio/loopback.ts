import type { AudioChunk } from '@cue/types';

/**
 * System-audio loopback capture — the OTHER party's audio (e.g. the far side
 * of a video call).
 *
 * NOTE (as-built): real loopback is now IMPLEMENTED, but in the desktop app,
 * not here. The desktop renderer captures system audio via Electron's
 * `getDisplayMedia({ audio: true })` routed through a main-process
 * `setDisplayMediaRequestHandler` that returns an `audio: 'loopback'` track
 * (ScreenCaptureKit on macOS 13+, WASAPI on Windows) — no native addon. It is
 * gated behind an in-app one-time consent disclosure. See
 * `apps/desktop/src/main/loopback.ts` + the renderer's
 * `audio/capture-streams.ts` / `hooks/use-consent.ts`.
 *
 * This module's `NotImplementedLoopbackCapture` remains as a placeholder for a
 * FUTURE `@cue/core`-side native per-process tap (Core Audio process taps,
 * macOS 14.4+) if we ever need capture independent of Electron's WebRTC path.
 * It is not on the shipped audio path.
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
