import { useCallback, useState } from 'react';

/**
 * One-time, locally-persisted acknowledgement that the user understands
 * capturing SYSTEM audio may record other participants and that they are
 * responsible for having consent / complying with local recording law.
 *
 * This is a lightweight in-product disclosure gate — not legal advice and not
 * a substitute for the (descoped) full consent/compliance work. It exists so
 * the headline "hear the other party" capability can't be enabled silently.
 */
const CONSENT_KEY = 'assistme.systemAudioConsent.v1';

function readConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'true';
  } catch {
    return false;
  }
}

export interface SystemAudioConsent {
  /** Whether the user has acknowledged the system-audio disclosure. */
  granted: boolean;
  /** Persist acknowledgement. */
  grant(): void;
  /** Clear acknowledgement (re-prompts next time). */
  revoke(): void;
}

export function useSystemAudioConsent(): SystemAudioConsent {
  const [granted, setGranted] = useState<boolean>(readConsent);

  const grant = useCallback((): void => {
    try {
      localStorage.setItem(CONSENT_KEY, 'true');
    } catch {
      /* localStorage unavailable — keep in-memory only for this session. */
    }
    setGranted(true);
  }, []);

  const revoke = useCallback((): void => {
    try {
      localStorage.removeItem(CONSENT_KEY);
    } catch {
      /* ignore */
    }
    setGranted(false);
  }, []);

  return { granted, grant, revoke };
}
