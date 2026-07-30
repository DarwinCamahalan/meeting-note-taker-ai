import { useCallback, useState } from 'react';
import { useCueStore } from './store';
import { useCueStream } from './hooks/use-cue-stream';
import { useAudioCapture } from './hooks/use-audio-capture';
import { useAuth } from './hooks/use-auth';
import { Overlay } from './components/Overlay';
import { AuthChip } from './components/AuthChip';
import './styles.css';

/**
 * Renderer entry / orchestrator (logic-light by design). It wires the store to
 * the main-process streams, owns the session on/off toggle, and coordinates the
 * mic capture with `window.cue.startSession()` / `stopSession()`. All rendering
 * lives in <Overlay> and its children; all reduction lives in the store.
 */
export function App(): React.JSX.Element {
  useCueStream();

  const state = useCueStore((s) => s.state);
  const partial = useCueStore((s) => s.partial);
  const cues = useCueStore((s) => s.cues);
  const reset = useCueStore((s) => s.reset);

  const audio = useAudioCapture();
  const auth = useAuth();
  const [active, setActive] = useState(false);

  const handleStart = useCallback(async (): Promise<void> => {
    setActive(true);
    reset();
    try {
      await window.cue.startSession();
      await audio.start();
    } catch {
      setActive(false);
    }
  }, [audio, reset]);

  const handleStop = useCallback(async (): Promise<void> => {
    audio.stop();
    try {
      await window.cue.stopSession();
    } finally {
      setActive(false);
    }
  }, [audio]);

  const currentCue = cues.length > 0 ? (cues[cues.length - 1] ?? null) : null;

  return (
    <Overlay
      state={state}
      cue={currentCue}
      partial={partial}
      active={active}
      capturing={audio.capturing}
      captureError={audio.error}
      onStart={() => void handleStart()}
      onStop={() => void handleStop()}
      authSlot={<AuthChip state={auth.state} onLogin={auth.login} onLogout={auth.logout} />}
    />
  );
}
