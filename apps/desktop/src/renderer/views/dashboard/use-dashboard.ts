import { useCallback, useEffect, useState } from 'react';
import type { AppSettings, AppStatus } from '@cue/types';

/** Dashboard navigation targets. */
export type DashboardPage = 'home' | 'settings' | 'shortcuts' | 'about';

/** Shared dashboard state + actions, loaded from the main process. */
export interface DashboardData {
  status: AppStatus | null;
  settings: AppSettings | null;
  busy: boolean;
  updateSettings(patch: Partial<AppSettings>): Promise<void>;
  startListening(): Promise<void>;
}

export function useDashboard(): DashboardData {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window.cue === 'undefined') return; // e.g. opened outside Electron
    void window.cue.getStatus().then(setStatus);
    void window.cue.getSettings().then(setSettings);
  }, []);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>): Promise<void> => {
    if (typeof window.cue === 'undefined') return;
    setSettings(await window.cue.setSettings(patch));
  }, []);

  const startListening = useCallback(async (): Promise<void> => {
    if (typeof window.cue === 'undefined') return;
    setBusy(true);
    try {
      await window.cue.startListening();
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, settings, busy, updateSettings, startListening };
}
