'use client';

import { useCallback, useState } from 'react';
import { isProblemDetails } from '@cue/sdk';
import { apiBaseUrl } from '@/lib/config/site';
import type { ActivateState, ApproveDeviceRequest } from '../types';

/**
 * Approve a desktop device_code against the `api` BFF. Uses a plain typed fetch
 * (the approve endpoint is outside the 4-method SDK surface) but parses
 * problem+json errors with the SDK's {@link isProblemDetails} guard.
 */
export function useActivate(deviceCode: string | null): {
  state: ActivateState;
  approve: () => Promise<void>;
} {
  const [state, setState] = useState<ActivateState>({ status: 'idle', error: null });

  const approve = useCallback(async () => {
    if (!deviceCode) {
      setState({ status: 'error', error: 'Missing device code in the activation link.' });
      return;
    }
    setState({ status: 'approving', error: null });

    const body: ApproveDeviceRequest = { device_code: deviceCode };
    try {
      const res = await fetch(`${apiBaseUrl()}/v1/auth/pkce/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const problem: unknown = await res.json().catch(() => null);
        const message = isProblemDetails(problem)
          ? (problem.detail ?? problem.title)
          : `Activation failed (${res.status}).`;
        setState({ status: 'error', error: message });
        return;
      }

      setState({ status: 'approved', error: null });
    } catch {
      setState({ status: 'error', error: 'Could not reach the activation service.' });
    }
  }, [deviceCode]);

  return { state, approve };
}
