'use client';

import { useMemo } from 'react';
import { CueApiClient } from '@cue/sdk';
import { apiBaseUrl } from '@/lib/config/site';
import { readClientTokens } from '@/lib/auth/client-session';

/**
 * A memoized, token-seeded {@link CueApiClient} for the admin console's client
 * hooks. Rehydrates the bearer token from the `cue_session` cookie so mutations
 * (`client.admin.*`, `client.sso.*`, `client.billing.*`) authenticate as the
 * signed-in admin. Refresh-on-401 is handled inside the SDK.
 */
export function useCueClient(): CueApiClient {
  return useMemo(() => {
    const tokens = readClientTokens();
    return new CueApiClient({
      baseUrl: apiBaseUrl(),
      ...(tokens ? { tokens } : {}),
    });
  }, []);
}
