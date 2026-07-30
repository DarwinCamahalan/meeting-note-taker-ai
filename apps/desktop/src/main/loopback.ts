import { desktopCapturer, session } from 'electron';

/**
 * Enable cross-platform SYSTEM-AUDIO LOOPBACK for `getDisplayMedia()` calls made
 * by the overlay renderer. This is how AssistMe hears the OTHER party (e.g. the
 * interviewer) in addition to the local microphone.
 *
 * Electron routes every renderer `getDisplayMedia()` request through this
 * handler. We auto-select the primary screen (Chromium requires a video source
 * to be present) and attach a loopback AUDIO track:
 *   - macOS 13+ : ScreenCaptureKit system-audio capture
 *   - Windows   : WASAPI loopback
 * The renderer immediately drops the video track and keeps only the audio, so
 * nothing is ever screen-recorded. No native addon is required — `audio:
 * 'loopback'` is a first-class Electron capability (≥ v31).
 *
 * Consent / recording-disclosure is enforced in the RENDERER by a one-time gate
 * (see `hooks/use-consent.ts` + `components/ConsentDialog.tsx`) BEFORE any
 * system-inclusive capture starts — this handler only wires the plumbing.
 *
 * Must be called once, after `app.whenReady()`, before the renderer can capture.
 */
export function registerDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => {
          const screenSource = sources[0];
          if (!screenSource) {
            // No capturable screen — deny cleanly. The renderer surfaces the
            // resulting "no audio track" error with remediation guidance.
            callback({});
            return;
          }
          callback({ video: screenSource, audio: 'loopback' });
        })
        .catch(() => {
          callback({});
        });
    },
    // Never pop the OS screen picker for an invisible HUD — we pick the screen
    // ourselves and only care about the loopback audio track.
    { useSystemPicker: false },
  );
}
