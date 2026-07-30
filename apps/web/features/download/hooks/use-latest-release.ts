'use client';

import { useEffect, useState } from 'react';
import type { ReleaseManifest } from '@/lib/release/types';

export interface LatestReleaseState {
  data: ReleaseManifest | null;
  isLoading: boolean;
  error: boolean;
}

/**
 * Tiny fetch-once hook over `/api/latest-release`. The route handler is
 * ISR-cached, so this stays cheap; no SWR dependency needed for the MVP.
 */
export function useLatestRelease(): LatestReleaseState {
  const [state, setState] = useState<LatestReleaseState>({
    data: null,
    isLoading: true,
    error: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const res = await fetch('/api/latest-release');
        if (!res.ok) throw new Error(`latest-release ${res.status}`);
        const data = (await res.json()) as ReleaseManifest;
        if (!cancelled) setState({ data, isLoading: false, error: false });
      } catch {
        if (!cancelled) setState({ data: null, isLoading: false, error: true });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
