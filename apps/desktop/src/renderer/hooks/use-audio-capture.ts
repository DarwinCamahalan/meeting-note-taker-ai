import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioChunk } from '@cue/types';
import type { AudioCapture } from '../types';
import { TARGET_CHANNELS, TARGET_SAMPLE_RATE, downsampleTo16k, floatToPcm16 } from '../utils';

/**
 * Microphone capture (the WORKING Phase 0 audio path). Opens the default input
 * via getUserMedia, runs it through a small WebAudio graph, and streams 16 kHz
 * mono linear16 PCM to the main process over `window.cue.sendAudioChunk`.
 *
 * We use a ScriptProcessorNode rather than an AudioWorklet: the worklet module
 * must be loaded from a URL, which the overlay's strict CSP (`script-src
 * 'self'`, no blob:) blocks. ScriptProcessor is deprecated but dependency-free
 * and adequate for the spike. TODO(phase-1): ship a bundled AudioWorklet and
 * relax CSP for `worklet-src 'self'`.
 */

/** ScriptProcessor frame size; 4096 @16 kHz ≈ 256 ms — fine for streaming STT. */
const BUFFER_SIZE = 4096;

interface AudioGraph {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
}

export function useAudioCapture(): AudioCapture {
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const graphRef = useRef<AudioGraph | null>(null);

  const teardown = useCallback((): void => {
    const graph = graphRef.current;
    graphRef.current = null;
    if (!graph) {
      return;
    }
    graph.processor.onaudioprocess = null;
    graph.processor.disconnect();
    graph.source.disconnect();
    for (const track of graph.stream.getTracks()) {
      track.stop();
    }
    void graph.context.close();
  }, []);

  const stop = useCallback((): void => {
    teardown();
    setCapturing(false);
  }, [teardown]);

  const start = useCallback(async (): Promise<void> => {
    if (graphRef.current) {
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: TARGET_CHANNELS, echoCancellation: true, noiseSuppression: true },
        video: false,
      });

      // Request the target rate directly; Chromium resamples the device feed.
      const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(BUFFER_SIZE, TARGET_CHANNELS, TARGET_CHANNELS);

      processor.onaudioprocess = (ev: AudioProcessingEvent): void => {
        if (typeof window.cue === 'undefined') {
          return;
        }
        const frame = ev.inputBuffer.getChannelData(0);
        const pcm = downsampleTo16k(frame, context.sampleRate);
        const chunk: AudioChunk = {
          data: floatToPcm16(pcm),
          sampleRate: TARGET_SAMPLE_RATE,
          channels: TARGET_CHANNELS,
          ts: Date.now(),
        };
        window.cue.sendAudioChunk(chunk);
      };

      // Connect through to the (silent) destination so the graph is pulled;
      // we never write the output buffer, so nothing is played back.
      source.connect(processor);
      processor.connect(context.destination);

      graphRef.current = { stream, context, source, processor };
      setCapturing(true);
    } catch (err: unknown) {
      teardown();
      setCapturing(false);
      setError(err instanceof Error ? err.message : 'Microphone access failed');
    }
  }, [teardown]);

  // Release the device if the component unmounts mid-capture.
  useEffect(() => teardown, [teardown]);

  return { capturing, error, start, stop };
}
