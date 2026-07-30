'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OrgSettings, UpdateOrgSettingsRequest } from '@cue/types';
import { errorMessage } from '../utils/format';
import type { AsyncState } from '../types';
import { useCueClient } from './use-cue-client';

export interface UseOrgSettings {
  settings: OrgSettings | null;
  load: AsyncState;
  mutation: AsyncState;
  refresh: () => Promise<void>;
  update: (body: UpdateOrgSettingsRequest) => Promise<void>;
}

/** Org settings read + partial update via `client.admin`. */
export function useOrgSettings(orgId: string): UseOrgSettings {
  const client = useCueClient();
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [load, setLoad] = useState<AsyncState>({ status: 'idle', error: null });
  const [mutation, setMutation] = useState<AsyncState>({ status: 'idle', error: null });

  const refresh = useCallback(async (): Promise<void> => {
    setLoad({ status: 'loading', error: null });
    try {
      const next = await client.admin.getOrgSettings(orgId);
      setSettings(next);
      setLoad({ status: 'success', error: null });
    } catch (err) {
      setLoad({ status: 'error', error: errorMessage(err, 'Could not load org settings.') });
    }
  }, [client, orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = useCallback(
    async (body: UpdateOrgSettingsRequest): Promise<void> => {
      setMutation({ status: 'loading', error: null });
      try {
        const next = await client.admin.updateOrgSettings(orgId, body);
        setSettings(next);
        setMutation({ status: 'success', error: null });
      } catch (err) {
        setMutation({ status: 'error', error: errorMessage(err, 'Could not save settings.') });
      }
    },
    [client, orgId],
  );

  return { settings, load, mutation, refresh, update };
}
