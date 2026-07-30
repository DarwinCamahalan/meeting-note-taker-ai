'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSsoSignin } from './hooks/use-sso-signin';
import { safeReturnPath } from './utils/domain';

/**
 * The "Sign in with SSO" entrypoint. Enter a work email; we resolve the org's
 * WorkOS connection by domain and redirect to the IdP. `?return=` chooses the
 * post-login destination (defaults to the admin console).
 */
export function SsoSigninForm(): React.JSX.Element {
  const params = useSearchParams();
  const returnTo = safeReturnPath(params.get('return'));
  const { status, error, signIn } = useSsoSignin(returnTo);
  const [email, setEmail] = useState('');
  const busy = status === 'resolving';

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void signIn(email);
  };

  return (
    <div className="surface-card">
      <h1 className="text-xl font-semibold">Sign in with SSO</h1>
      <p className="mt-2 text-sm text-white/60">
        Enter your work email and we'll route you to your organization's identity provider.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-widest text-white/40">Work email</span>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-cue-400"
          />
        </label>

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Redirecting…' : 'Continue with SSO'}
        </button>

        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
      </form>

      <p className="mt-6 text-xs text-white/35">
        Personal account? Sign in from the Cue desktop app instead.
      </p>
    </div>
  );
}
