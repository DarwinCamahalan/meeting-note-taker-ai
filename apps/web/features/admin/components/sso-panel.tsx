'use client';

import type { SsoConnection } from '@cue/types';
import { useAdminContext } from '../context';
import { useSsoConnections } from '../hooks/use-sso-connections';
import { useEntitlements } from '../hooks/use-entitlements';
import { formatDate } from '../utils/format';
import { SectionCard } from './section-card';
import { SsoConnectionForm } from './sso-connection-form';
import { EmptyNote, ErrorNote, LoadingNote, StatusBadge } from './status-note';
import { UpgradeNote } from './upgrade-note';

function connectionTone(status: SsoConnection['status']): 'active' | 'pending' | 'muted' {
  if (status === 'active') return 'active';
  if (status === 'draft' || status === 'validating') return 'pending';
  return 'muted';
}

/** SSO connection setup (WorkOS): create/list/delete per-org connections. */
export function SsoPanel(): React.JSX.Element {
  const { orgId } = useAdminContext();
  const sso = useSsoConnections(orgId);
  const { has, load: entLoad } = useEntitlements();

  const ssoEnabled = has('auth.sso_lite') || has('auth.saml_scim');

  const onDelete = (connection: SsoConnection): void => {
    if (window.confirm(`Delete the SSO connection for ${connection.domain}?`)) {
      void sso.deleteConnection(connection.id);
    }
  };

  if (entLoad.status === 'loading') {
    return (
      <SectionCard title="Single sign-on">
        <LoadingNote label="Checking plan…" />
      </SectionCard>
    );
  }

  if (!ssoEnabled) {
    return (
      <SectionCard title="Single sign-on" description="SAML / OIDC sign-in and SCIM provisioning via WorkOS.">
        <UpgradeNote feature="Single sign-on" />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Add a connection"
        description="Provision a WorkOS connection, then finish IdP setup in the WorkOS dashboard."
      >
        <SsoConnectionForm mutation={sso.mutation} onCreate={sso.createConnection} />
        {sso.mutation.error && (
          <div className="mt-3">
            <ErrorNote message={sso.mutation.error} />
          </div>
        )}
      </SectionCard>

      <SectionCard title="Connections" description="Directory + SSO connections routing your domains.">
        {sso.load.error && <ErrorNote message={sso.load.error} />}
        {sso.connections.length === 0 && sso.load.status === 'loading' ? (
          <LoadingNote label="Loading connections…" />
        ) : sso.connections.length === 0 ? (
          <EmptyNote>No SSO connections yet.</EmptyNote>
        ) : (
          <ul className="divide-y divide-white/5">
            {sso.connections.map((connection) => (
              <li key={connection.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white/90">{connection.domain}</p>
                    <StatusBadge tone={connectionTone(connection.status)}>{connection.status}</StatusBadge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-white/40">
                    {connection.provider.toUpperCase()} · {connection.workosConnectionId ?? 'not yet connected'} · created{' '}
                    {formatDate(connection.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={sso.mutation.status === 'loading'}
                  onClick={() => onDelete(connection)}
                  className="text-xs font-medium text-red-300 transition hover:text-red-200 disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
