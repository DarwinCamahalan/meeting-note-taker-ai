'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CreateSsoConnectionRequest, SsoConnection } from '@cue/types';
import { errorMessage } from '../utils/format';
import type { AsyncState } from '../types';
import { useCueClient } from './use-cue-client';

export interface UseSsoConnections {
  connections: SsoConnection[];
  load: AsyncState;
  mutation: AsyncState;
  refresh: () => Promise<void>;
  createConnection: (body: CreateSsoConnectionRequest) => Promise<SsoConnection | null>;
  deleteConnection: (connectionId: string) => Promise<void>;
}

/**
 * Org SSO connection CRUD via `client.sso`. Provisioning a connection returns
 * the WorkOS-backed row (with `workosConnectionId` deep-link ids) which is
 * prepended locally.
 */
export function useSsoConnections(orgId: string): UseSsoConnections {
  const client = useCueClient();
  const [connections, setConnections] = useState<SsoConnection[]>([]);
  const [load, setLoad] = useState<AsyncState>({ status: 'idle', error: null });
  const [mutation, setMutation] = useState<AsyncState>({ status: 'idle', error: null });

  const refresh = useCallback(async (): Promise<void> => {
    setLoad({ status: 'loading', error: null });
    try {
      const rows = await client.sso.listConnections(orgId);
      setConnections(rows);
      setLoad({ status: 'success', error: null });
    } catch (err) {
      setLoad({ status: 'error', error: errorMessage(err, 'Could not load SSO connections.') });
    }
  }, [client, orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createConnection = useCallback(
    async (body: CreateSsoConnectionRequest): Promise<SsoConnection | null> => {
      setMutation({ status: 'loading', error: null });
      try {
        const connection = await client.sso.createConnection(orgId, body);
        setConnections((prev) => [connection, ...prev]);
        setMutation({ status: 'success', error: null });
        return connection;
      } catch (err) {
        setMutation({ status: 'error', error: errorMessage(err, 'Could not create connection.') });
        return null;
      }
    },
    [client, orgId],
  );

  const deleteConnection = useCallback(
    async (connectionId: string): Promise<void> => {
      setMutation({ status: 'loading', error: null });
      try {
        await client.sso.deleteConnection(orgId, connectionId);
        setConnections((prev) => prev.filter((c) => c.id !== connectionId));
        setMutation({ status: 'success', error: null });
      } catch (err) {
        setMutation({ status: 'error', error: errorMessage(err, 'Could not delete connection.') });
      }
    },
    [client, orgId],
  );

  return { connections, load, mutation, refresh, createConnection, deleteConnection };
}
