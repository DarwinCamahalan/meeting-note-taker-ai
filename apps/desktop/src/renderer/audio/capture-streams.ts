import { TARGET_CHANNELS } from '../utils';

/**
 * Audio SOURCE helpers — open the raw MediaStreams the capture graph mixes.
 * No React, no WebAudio graph here; just device/loopback acquisition.
 */

/** Open the default microphone as a mono stream (the local user's voice). */
export async function getMicStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { channelCount: TARGET_CHANNELS, echoCancellation: true, noiseSuppression: true },
    video: false,
  });
}

/**
 * Open a SYSTEM-AUDIO (loopback) stream — the other participants' audio as it
 * plays out of this machine. The main process's display-media handler attaches
 * a loopback audio track (ScreenCaptureKit on macOS 13+, WASAPI on Windows).
 *
 * Chromium requires a video constraint on getDisplayMedia, so we ask for video
 * then immediately drop it — only the audio track is ever used, and nothing is
 * screen-recorded.
 */
export async function getSystemAudioStream(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

  for (const track of stream.getVideoTracks()) {
    track.stop();
    stream.removeTrack(track);
  }

  if (stream.getAudioTracks().length === 0) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    throw new Error(
      'No system-audio track was returned. On macOS, grant Screen Recording to ' +
        'AssistMe (System Settings → Privacy & Security → Screen Recording) and relaunch.',
    );
  }

  return stream;
}
