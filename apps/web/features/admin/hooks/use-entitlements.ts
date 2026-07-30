'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EntitlementKey, EntitlementsResponse } from '@cue/types';
import { errorMessage } from '../utils/format';
import type { AsyncState } from '../types';
import { useCueClient } from './use-cue-client';

export interface UseEntitlements {
  snapshot: EntitlementsResponse | null;
  load: AsyncState;
  /** True when the given entitlement key is enabled on the current plan. */
  has: (key: EntitlementKey) => boolean;
}

/**
 * The resolved entitlement snapshot (`GET /v1/me/entitlements`) for gating the
 * admin console's Team-only surfaces (SSO/SAML, admin, RBAC). Entitlements —
 * not tier names — remain the feature-gate source of truth.
 */
export function useEntitlements(): UseEntitlements {
  const client = useCueClient();
  const [snapshot, setSnapshot] = useState<EntitlementsResponse | null>(null);
  const [load, setLoad] = useState<AsyncState>({ status: 'idle', error: null });

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: 'loading', error: null });
    client.billing
      .getEntitlements()
      .then((snap) => {
        if (cancelled) return;
        setSnapshot(snap);
        setLoad({ status: 'success', error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoad({ status: 'error', error: errorMessage(err, 'Could not load entitlements.') });
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const has = useCallback(
    (key: EntitlementKey): boolean =>
      snapshot?.entitlements.some((e) => e.key === key && e.enabled) ?? false,
    [snapshot],
  );

  return { snapshot, load, has };
}
