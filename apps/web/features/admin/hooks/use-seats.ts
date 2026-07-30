'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EntitlementsResponse, SeatSummary } from '@cue/types';
import { errorMessage } from '../utils/format';
import type { AsyncState } from '../types';
import { useCueClient } from './use-cue-client';

export interface UseSeats {
  seats: SeatSummary | null;
  entitlements: EntitlementsResponse | null;
  load: AsyncState;
  portal: AsyncState;
  refresh: () => Promise<void>;
  /** Open the Stripe Customer Portal to manage the Team subscription/seats. */
  openBillingPortal: () => Promise<void>;
}

/**
 * Team seat accounting (`client.admin.seats`) alongside the resolved entitlement
 * snapshot (`client.billing.getEntitlements`), plus a Stripe Customer Portal
 * launcher for seat/subscription management.
 */
export function useSeats(orgId: string): UseSeats {
  const client = useCueClient();
  const [seats, setSeats] = useState<SeatSummary | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementsResponse | null>(null);
  const [load, setLoad] = useState<AsyncState>({ status: 'idle', error: null });
  const [portal, setPortal] = useState<AsyncState>({ status: 'idle', error: null });

  const refresh = useCallback(async (): Promise<void> => {
    setLoad({ status: 'loading', error: null });
    try {
      const [seatSummary, ents] = await Promise.all([
        client.admin.seats(orgId),
        client.billing.getEntitlements(),
      ]);
      setSeats(seatSummary);
      setEntitlements(ents);
      setLoad({ status: 'success', error: null });
    } catch (err) {
      setLoad({ status: 'error', error: errorMessage(err, 'Could not load seat usage.') });
    }
  }, [client, orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openBillingPortal = useCallback(async (): Promise<void> => {
    setPortal({ status: 'loading', error: null });
    try {
      const { url } = await client.billing.portalLink();
      window.location.assign(url);
    } catch (err) {
      setPortal({ status: 'error', error: errorMessage(err, 'Could not open the billing portal.') });
    }
  }, [client]);

  return { seats, entitlements, load, portal, refresh, openBillingPortal };
}
