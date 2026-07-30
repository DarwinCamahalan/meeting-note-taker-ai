import { useCallback, useEffect, useRef, useState } from 'react';
import { useCueStore } from '../store';
import { useCueStream } from '../hooks/use-cue-stream';
import { useAudioCapture } from '../hooks/use-audio-capture';
import { useSystemAudioConsent } from '../hooks/use-consent';
import { useAuth } from '../hooks/use-auth';
import { Overlay } from '../components/Overlay';
import { ConsentDialog } from '../components/ConsentDialog';
import { AuthChip } from '../components/AuthChip';

/**
 * The content-protected listening overlay (the `?view=overlay` window).
 *
 * AssistMe always listens to BOTH the local mic and system audio (the other
 * participants), mixed into one stream — a meeting/interview needs the whole
 * conversation, so there is no per-source choice. Capture auto-starts when the
 * overlay is shown (consent-gated on first use); the Start button re-triggers
 * with a user gesture if the optimistic auto-start is blocked.
 */
export function SessionApp(): React.JSX.Element {
  useCueStream();
  const state = useCueStore((s) => s.state);
  const partial = useCueStore((s) => s.partial);
  const cues = useCueStore((s) => s.cues);
  const reset = useCueStore((s) => s.reset);

  const audio = useAudioCapture();
  const consent = useSystemAudioConsent();
  const auth = useAuth();
  const [active, setActive] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const autoStarted = useRef(false);

  const beginCapture = useCallback(async (): Promise<void> => {
    setActive(true);
    reset();
    try {
      await audio.start('both');
      await window.cue.startSession();
    } catch {
      audio.stop();
      setActive(false);
    }
  }, [audio, reset]);

  const handleStart = useCallback((): void => {
    if (!consent.granted) {
      setConsentOpen(true);
      return;
    }
    void beginCapture();
  }, [consent.granted, beginCapture]);

  const handleStop = useCallback(async (): Promise<void> => {
    audio.stop();
    try {
      await window.cue.stopSession();
    } finally {
      setActive(false);
      void window.cue.stopListening(); // hide overlay, return to dashboard
    }
  }, [audio]);

  const acknowledgeConsent = useCallback((): void => {
    consent.grant();
    setConsentOpen(false);
    void beginCapture(); // the ack click is the user gesture getDisplayMedia needs
  }, [consent, beginCapture]);

  // Auto-begin once, when the overlay is shown: consent dialog on first run,
  // else an optimistic start (Start button retries with a gesture on failure).
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    if (!consent.granted) setConsentOpen(true);
    else void beginCapture();
  }, [consent.granted, beginCapture]);

  const currentCue = cues.length > 0 ? (cues[cues.length - 1] ?? null) : null;

  return (
    <>
      <Overlay
        state={state}
        cue={currentCue}
        partial={partial}
        active={active}
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
