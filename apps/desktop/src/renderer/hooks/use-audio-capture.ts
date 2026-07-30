import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioChunk } from '@cue/types';
import type { AudioCapture, AudioSource } from '../types';
import { TARGET_CHANNELS, TARGET_SAMPLE_RATE, downsampleTo16k, floatToPcm16 } from '../utils';
import { getMicStream, getSystemAudioStream } from '../audio/capture-streams';

/**
 * Audio capture for the overlay. Opens the microphone and/or the system-audio
 * loopback (per the selected {@link AudioSource}), MIXES them into a single
 * WebAudio graph, and streams 16 kHz mono linear16 PCM to the main process over
 * `window.cue.sendAudioChunk`.
 *
 * Mixing is implicit: connecting multiple MediaStream sources into one node
 * sums them at the node input, so `mic + system` becomes one mono stream — the
 * full conversation — which is exactly what the STT + cue pipeline wants.
 *
 * We use a ScriptProcessorNode rather than an AudioWorklet: the worklet module
 * must be loaded from a URL, which the overlay's strict CSP (`script-src
 * 'self'`, no blob:) blocks. ScriptProcessor is deprecated but dependency-free
 * and adequate here. TODO(later): ship a bundled AudioWorklet + relax CSP.
 */

/** ScriptProcessor frame size; 4096 @16 kHz ≈ 256 ms — fine for streaming STT. */
const BUFFER_SIZE = 4096;

interface AudioGraph {
  streams: MediaStream[];
  context: AudioContext;
  sources: MediaStreamAudioSourceNode[];
  processor: ScriptProcessorNode;
}

/** Which raw streams a given source selection needs. */
async function openStreams(source: AudioSource): Promise<MediaStream[]> {
  const streams: MediaStream[] = [];
  try {
    if (source === 'mic' || source === 'both') {
      streams.push(await getMicStream());
    }
    if (source === 'system' || source === 'both') {
      streams.push(await getSystemAudioStream());
    }
  } catch (err) {
    // Release anything already opened before this one failed.
    for (const s of streams) {
      for (const t of s.getTracks()) t.stop();
    }
    throw err;
  }
  return streams;
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
    for (const src of graph.sources) {
      src.disconnect();
    }
    for (const stream of graph.streams) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    void graph.context.close();
  }, []);

  const stop = useCallback((): void => {
    teardown();
    setCapturing(false);
  }, [teardown]);

  const start = useCallback(
    async (source: AudioSource): Promise<void> => {
      if (graphRef.current) {
        return;
      }
      setError(null);
      let streams: MediaStream[] = [];
      try {
        streams = await openStreams(source);

        // Request the target rate directly; Chromium resamples the device feed.
        const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
        const sources = streams.map((s) => context.createMediaStreamSource(s));
        const processor = context.createScriptProcessor(
          BUFFER_SIZE,
          TARGET_CHANNELS,
          TARGET_CHANNELS,
        );

        processor.onaudioprocess = (ev: AudioProcessingEvent): void => {
          if (typeof window.cue === 'undefined') {
            return;
          }
          // channel 0 is the SUM of every connected source (mic + system).
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

        // Connect every source through to the (silent) destination so the graph
        // is pulled; we never write the output buffer, so nothing plays back.
        for (const src of sources) {
          src.connect(processor);
        }
        processor.connect(context.destination);

        graphRef.current = { streams, context, sources, processor };
        setCapturing(true);
      } catch (err: unknown) {
        for (const s of streams) {
          for (const t of s.getTracks()) t.stop();
        }
        teardown();
        setCapturing(false);
        setError(err instanceof Error ? err.message : 'Audio capture failed');
      }
    },
    [teardown],
  );

  // Release devices if the component unmounts mid-capture.
  useEffect(() => teardown, [teardown]);

  return { capturing, error, start, stop };
}
