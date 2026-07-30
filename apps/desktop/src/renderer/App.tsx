import { useCallback, useState } from 'react';
import { useCueStore } from './store';
import { useCueStream } from './hooks/use-cue-stream';
import { useAudioCapture } from './hooks/use-audio-capture';
import { useSystemAudioConsent } from './hooks/use-consent';
import { useAuth } from './hooks/use-auth';
import { Overlay } from './components/Overlay';
import { ConsentDialog } from './components/ConsentDialog';
import { AuthChip } from './components/AuthChip';
import type { AudioSource } from './types';
import './styles.css';

/**
 * Renderer entry / orchestrator (logic-light by design). It wires the store to
 * the main-process streams, owns the session on/off toggle + audio-source
 * selection, gates system-audio capture behind a one-time consent disclosure,
 * and coordinates capture with `window.cue.startSession()` / `stopSession()`.
 */
export function App(): React.JSX.Element {
  useCueStream();

  const state = useCueStore((s) => s.state);
  const partial = useCueStore((s) => s.partial);
  const cues = useCueStore((s) => s.cues);
  const reset = useCueStore((s) => s.reset);

  const audio = useAudioCapture();
  const consent = useSystemAudioConsent();
  const auth = useAuth();
  const [active, setActive] = useState(false);
  const [source, setSource] = useState<AudioSource>('mic');
  const [consentOpen, setConsentOpen] = useState(false);

  // Open capture FIRST (it uses the fresh click gesture that getDisplayMedia
  // needs) and only start the session if capture actually came up.
  const beginCapture = useCallback(
    async (src: AudioSource): Promise<void> => {
      setActive(true);
      reset();
      try {
        await audio.start(src);
        await window.cue.startSession();
      } catch {
        audio.stop();
        setActive(false);
      }
    },
    [audio, reset],
  );

  const handleStart = useCallback((): void => {
    if (source !== 'mic' && !consent.granted) {
      setConsentOpen(true);
      return;
    }
    void beginCapture(source);
  }, [source, consent.granted, beginCapture]);

  const handleStop = useCallback(async (): Promise<void> => {
    audio.stop();
    try {
      await window.cue.stopSession();
    } finally {
      setActive(false);
    }
  }, [audio]);

  const acknowledgeConsent = useCallback((): void => {
    consent.grant();
    setConsentOpen(false);
    void beginCapture(source);
  }, [consent, source, beginCapture]);

  const currentCue = cues.length > 0 ? (cues[cues.length - 1] ?? null) : null;

  return (
    <>
      <Overlay
        state={state}
        cue={currentCue}
        partial={partial}
        active={active}
        source={source}
        onSourceChange={setSource}
        capturing={audio.capturing}
        captureError={audio.error}
        onStart={handleStart}
        onStop={() => void handleStop()}
        authSlot={<AuthChip state={auth.state} onLogin={auth.login} onLogout={auth.logout} />}
      />
      <ConsentDialog
        open={consentOpen}
        onAcknowledge={acknowledgeConsent}
        onCancel={() => setConsentOpen(false)}
      />
    </>
  );
}
