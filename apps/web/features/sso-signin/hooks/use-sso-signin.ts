'use client';

import { useCallback, useState } from 'react';
import { CueApiClient } from '@cue/sdk';
import { apiBaseUrl } from '@/lib/config/site';
import { domainFromEmail, safeReturnPath } from '../utils/domain';

export type SsoSigninStatus = 'idle' | 'resolving' | 'error';

export interface UseSsoSignin {
  status: SsoSigninStatus;
  error: string | null;
  /** Resolve the org's WorkOS authorization URL for `email`'s domain and redirect. */
  signIn: (email: string) => Promise<void>;
}

/**
 * "Sign in with SSO" launcher. Takes a work email, derives the domain, asks the
 * `api` for the org's WorkOS authorization URL (`GET /v1/sso/authorize`), and
 * full-page-redirects the browser to the IdP. `state` carries the post-login
 * return path back through the WorkOS -> api callback -> web handoff.
 */
export function useSsoSignin(returnTo: string): UseSsoSignin {
  const [status, setStatus] = useState<SsoSigninStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(
    async (email: string): Promise<void> => {
      const domain = domainFromEmail(email);
      if (!domain) {
        setStatus('error');
        setError('Enter a valid work email address.');
        return;
      }
      setStatus('resolving');
      setError(null);
      try {
        const client = new CueApiClient({ baseUrl: apiBaseUrl() });
        const { authorizationUrl } = await client.sso.authorize({
          domain,
          // Opaque state echoed back on the callback so the api knows where to
          // land the browser in the web app after minting our tokens.
          state: safeReturnPath(returnTo),
        });
        window.location.assign(authorizationUrl);
      } catch {
        setStatus('error');
        setError('We could not find SSO for that domain. Check with your admin, or use the desktop app to sign in.');
      }
    },
    [returnTo],
  );

  return { status, error, signIn };
}
