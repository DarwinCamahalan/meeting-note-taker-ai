'use client';

import { useState, type FormEvent } from 'react';
import type { CreateSsoConnectionRequest, SsoProvider } from '@cue/types';
import type { AsyncState } from '../types';

const PROVIDERS: { value: SsoProvider; label: string; hint: string }[] = [
  { value: 'authkit', label: 'AuthKit (hosted)', hint: 'WorkOS-hosted multi-provider sign-in.' },
  { value: 'saml', label: 'SAML 2.0', hint: 'Direct enterprise IdP (Okta, Entra, etc.).' },
  { value: 'oidc', label: 'OIDC', hint: 'OpenID Connect enterprise connection.' },
];

/**
 * Provision a new WorkOS-backed SSO connection for the org: pick a protocol and
 * bind an email domain. The server creates (or reuses) the WorkOS Organization
 * and returns a `draft` connection to finish configuring in the WorkOS portal.
 */
export function SsoConnectionForm({
  mutation,
  onCreate,
}: {
  mutation: AsyncState;
  onCreate: (body: CreateSsoConnectionRequest) => Promise<unknown>;
}): React.JSX.Element {
  const [provider, setProvider] = useState<SsoProvider>('authkit');
  const [domain, setDomain] = useState('');
  const submitting = mutation.status === 'loading';

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmed = domain.trim().toLowerCase();
    if (!trimmed) return;
    const result = await onCreate({ provider, domain: trimmed });
    if (result) setDomain('');
  };

  const hint = PROVIDERS.find((p) => p.value === provider)?.hint;

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="mb-1.5 block text-xs uppercase tracking-widest text-white/40">Provider</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as SsoProvider)}
            className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none focus:border-cue-400"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-xs uppercase tracking-widest text-white/40">Email domain</span>
          <input
            type="text"
            required
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="acme.com"
            className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-cue-400"
          />
        </label>
      </div>
      {hint && <p className="text-xs text-white/40">{hint}</p>}
      <button type="submit" disabled={submitting} className="btn-primary !px-5 !py-2.5">
        {submitting ? 'Creating…' : 'Create connection'}
      </button>
    </form>
  );
}
