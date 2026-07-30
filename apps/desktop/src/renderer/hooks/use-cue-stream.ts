import { useEffect } from 'react';
import { useCueStore } from '../store';

/**
 * Bridges the main process's push streams (exposed on `window.cue` by the
 * preload contextBridge) into the Zustand store. Mount once, high in the tree.
 *
 * Each `on*` subscriber returns an unsubscribe fn; we tear them all down on
 * unmount so React 19 StrictMode's double-invoke can't leak listeners.
 */
export function useCueStream(): void {
  useEffect(() => {
    // Defensive: during an isolated HMR update the bridge could be momentarily
    // absent. In a real render it is always injected by the preload script.
    if (typeof window.cue === 'undefined') {
      return;
    }

    const { setState, applyTranscript, applyCue } = useCueStore.getState();

    const unsubState = window.cue.onState(setState);
    const unsubTranscript = window.cue.onTranscript(applyTranscript);
    const unsubCue = window.cue.onCue(applyCue);

    return () => {
      unsubState();
      unsubTranscript();
      unsubCue();
    };
  }, []);
}
