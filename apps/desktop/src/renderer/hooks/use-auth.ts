import { useCallback, useEffect, useState } from 'react';
import type { AuthState } from '@cue/types';

/**
 * Renderer-side auth state, mirrored from the main-process AuthManager over the
 * `window.cue` bridge. Hydrates once on mount and subscribes to pushes; exposes
 * thin `login`/`logout` proxies. All PKCE/token logic stays in main — this hook
 * only reflects a redacted {@link AuthState}.
 */
export interface UseAuth {
  state: AuthState;
  login(): void;
  logout(): void;
}

export function useAuth(): UseAuth {
  const [state, setState] = useState<AuthState>({ status: 'signed_out' });

  useEffect(() => {
    if (typeof window.cue === 'undefined') return;

    let active = true;
    void window.cue.getAuthState().then((s) => {
      if (active) setState(s);
    });
    const unsub = window.cue.onAuthState(setState);

    return () => {
      active = false;
      unsub();
    };
  }, []);

  const login = useCallback((): void => {
    void window.cue.login().then(setState);
  }, []);

  const logout = useCallback((): void => {
    void window.cue.logout();
  }, []);

  return { state, login, logout };
}
