import type { AuthState } from '@cue/types';

interface AuthChipProps {
  state: AuthState;
  onLogin(): void;
  onLogout(): void;
}

/** Human label for each auth status. */
const LABEL: Record<AuthState['status'], string> = {
  signed_out: 'Sign in',
  authenticating: 'Signing in…',
  signed_in: 'Signed in',
  error: 'Retry sign-in',
};

/**
 * Minimal sign-in affordance for the overlay header. Purely reflective: it
 * renders the {@link AuthState} pushed from main and proxies clicks to the
 * `login`/`logout` IPC calls. Only relevant to the `gateway` backend; harmless
 * (and unobtrusive) in the default local path.
 */
export function AuthChip({ state, onLogin, onLogout }: AuthChipProps): React.JSX.Element {
  const { status } = state;
  const busy = status === 'authenticating';
  const signedIn = status === 'signed_in';

  const title = signedIn
    ? (state.user?.email ?? 'Signed in')
    : status === 'error'
      ? (state.error ?? 'Sign-in failed')
      : LABEL[status];

  return (
    <button
      type="button"
      className={`auth-chip no-drag auth-chip--${status}`}
      onClick={signedIn ? onLogout : onLogin}
      disabled={busy}
      title={title}
    >
      <span className="auth-chip__dot" aria-hidden />
      {signedIn ? 'Sign out' : LABEL[status]}
    </button>
  );
}
