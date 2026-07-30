'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CreateInviteRequest, OrgInvite } from '@cue/types';
import { errorMessage } from '../utils/format';
import type { AsyncState } from '../types';
import { useCueClient } from './use-cue-client';

export interface UseInvites {
  invites: OrgInvite[];
  load: AsyncState;
  mutation: AsyncState;
  refresh: () => Promise<void>;
  createInvite: (body: CreateInviteRequest) => Promise<OrgInvite | null>;
}

/**
 * Org invitations list + create, via `client.admin`. On success the new invite
 * is prepended locally so the table updates without a full re-fetch.
 */
export function useInvites(orgId: string): UseInvites {
  const client = useCueClient();
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [load, setLoad] = useState<AsyncState>({ status: 'idle', error: null });
  const [mutation, setMutation] = useState<AsyncState>({ status: 'idle', error: null });

  const refresh = useCallback(async (): Promise<void> => {
    setLoad({ status: 'loading', error: null });
    try {
      const rows = await client.admin.listInvites(orgId);
      setInvites(rows);
      setLoad({ status: 'success', error: null });
    } catch (err) {
      setLoad({ status: 'error', error: errorMessage(err, 'Could not load invitations.') });
    }
  }, [client, orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createInvite = useCallback(
    async (body: CreateInviteRequest): Promise<OrgInvite | null> => {
      setMutation({ status: 'loading', error: null });
      try {
        const invite = await client.admin.createInvite(orgId, body);
        setInvites((prev) => [invite, ...prev]);
        setMutation({ status: 'success', error: null });
        return invite;
      } catch (err) {
        setMutation({ status: 'error', error: errorMessage(err, 'Could not send invite.') });
        return null;
      }
    },
    [client, orgId],
  );

  return { invites, load, mutation, refresh, createInvite };
}
