'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminMemberView, Role } from '@cue/types';
import { errorMessage } from '../utils/format';
import type { AsyncState } from '../types';
import { useCueClient } from './use-cue-client';

const PAGE_SIZE = 25;

export interface UseMembers {
  members: AdminMemberView[];
  load: AsyncState;
  mutation: AsyncState;
  /** True while a next cursor is available. */
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  updateRole: (userId: string, role: Role) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
}

/**
 * Cursor-paginated org member list plus role-change / removal mutations, all via
 * `client.admin`. Optimistic-free: mutations re-read the affected row from the
 * server response (updateMember) or drop it locally (removeMember).
 */
export function useMembers(orgId: string): UseMembers {
  const client = useCueClient();
  const [members, setMembers] = useState<AdminMemberView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [load, setLoad] = useState<AsyncState>({ status: 'idle', error: null });
  const [mutation, setMutation] = useState<AsyncState>({ status: 'idle', error: null });

  const fetchPage = useCallback(
    async (nextCursor: string | null, append: boolean): Promise<void> => {
      setLoad({ status: 'loading', error: null });
      try {
        const page = await client.admin.listMembers(orgId, {
          limit: PAGE_SIZE,
          ...(nextCursor ? { cursor: nextCursor } : {}),
        });
        setMembers((prev) => (append ? [...prev, ...page.data] : page.data));
        setCursor(page.nextCursor ?? null);
        setHasMore(Boolean(page.nextCursor));
        setLoad({ status: 'success', error: null });
      } catch (err) {
        setLoad({ status: 'error', error: errorMessage(err, 'Could not load members.') });
      }
    },
    [client, orgId],
  );

  useEffect(() => {
    void fetchPage(null, false);
  }, [fetchPage]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!cursor) return;
    await fetchPage(cursor, true);
  }, [cursor, fetchPage]);

  const refresh = useCallback(async (): Promise<void> => {
    await fetchPage(null, false);
  }, [fetchPage]);

  const updateRole = useCallback(
    async (userId: string, role: Role): Promise<void> => {
      setMutation({ status: 'loading', error: null });
      try {
        const updated = await client.admin.updateMember(orgId, userId, { role });
        setMembers((prev) => prev.map((m) => (m.userId === userId ? updated : m)));
        setMutation({ status: 'success', error: null });
      } catch (err) {
        setMutation({ status: 'error', error: errorMessage(err, 'Could not update role.') });
      }
    },
    [client, orgId],
  );

  const removeMember = useCallback(
    async (userId: string): Promise<void> => {
      setMutation({ status: 'loading', error: null });
      try {
        await client.admin.removeMember(orgId, userId);
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
        setMutation({ status: 'success', error: null });
      } catch (err) {
        setMutation({ status: 'error', error: errorMessage(err, 'Could not remove member.') });
      }
    },
    [client, orgId],
  );

  return { members, load, mutation, hasMore, loadMore, refresh, updateRole, removeMember };
}
