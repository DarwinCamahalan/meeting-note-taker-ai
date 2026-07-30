'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { Role, UpdateOrgSettingsRequest } from '@cue/types';
import { useAdminContext } from '../context';
import { useOrgSettings } from '../hooks/use-org-settings';
import { ASSIGNABLE_ROLES, roleLabel } from '../utils/roles';
import { SectionCard } from './section-card';
import { ErrorNote, LoadingNote } from './status-note';

/** Editable draft mirroring {@link UpdateOrgSettingsRequest} as form strings. */
interface SettingsDraft {
  name: string;
  slug: string;
  ssoDomains: string;
  allowDomainJoin: boolean;
  defaultMemberRole: Role;
}

function domainsToText(domains: string[]): string {
  return domains.join(', ');
}

function textToDomains(text: string): string[] {
  return text
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/** Org settings: name, slug, SSO domains, domain-join policy, default role. */
export function SettingsPanel(): React.JSX.Element {
  const { orgId } = useAdminContext();
  const { settings, load, mutation, update } = useOrgSettings(orgId);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);

  useEffect(() => {
    if (!settings) return;
    setDraft({
      name: settings.name,
      slug: settings.slug,
      ssoDomains: domainsToText(settings.ssoDomains),
      allowDomainJoin: settings.allowDomainJoin,
      defaultMemberRole: settings.defaultMemberRole,
    });
  }, [settings]);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!draft) return;
    const body: UpdateOrgSettingsRequest = {
      name: draft.name.trim(),
      slug: draft.slug.trim(),
      ssoDomains: textToDomains(draft.ssoDomains),
      allowDomainJoin: draft.allowDomainJoin,
      defaultMemberRole: draft.defaultMemberRole,
    };
    await update(body);
  };

  if (load.status === 'loading' && !draft) {
    return (
      <SectionCard title="Organization settings">
        <LoadingNote label="Loading settings…" />
      </SectionCard>
    );
  }

  if (load.error && !draft) {
    return (
      <SectionCard title="Organization settings">
        <ErrorNote message={load.error} />
      </SectionCard>
    );
  }

  if (!draft) {
    return (
      <SectionCard title="Organization settings">
        <LoadingNote />
      </SectionCard>
    );
  }

  const saving = mutation.status === 'loading';

  return (
    <SectionCard title="Organization settings" description="Identity, SSO routing, and provisioning defaults.">
      <form onSubmit={(e) => void submit(e)} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-xs uppercase tracking-widest text-white/40">Name</span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none focus:border-cue-400"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs uppercase tracking-widest text-white/40">Slug</span>
            <input
              type="text"
              value={draft.slug}
              onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
              className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none focus:border-cue-400"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-widest text-white/40">SSO email domains</span>
          <input
            type="text"
            value={draft.ssoDomains}
            onChange={(e) => setDraft({ ...draft, ssoDomains: e.target.value })}
            placeholder="acme.com, acme.io"
            className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-cue-400"
          />
          <span className="mt-1 block text-xs text-white/40">Comma-separated. Used to route SSO sign-in and JIT provisioning.</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-ink-950/40 px-3 py-3">
            <input
              type="checkbox"
              checked={draft.allowDomainJoin}
              onChange={(e) => setDraft({ ...draft, allowDomainJoin: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-cue-500"
            />
            <span>
              <span className="block text-sm text-white/85">Allow domain join</span>
              <span className="block text-xs text-white/45">Auto-add verified users whose email matches an SSO domain.</span>
            </span>
          </label>
          <label>
            <span className="mb-1.5 block text-xs uppercase tracking-widest text-white/40">Default member role</span>
            <select
              value={draft.defaultMemberRole}
              onChange={(e) => setDraft({ ...draft, defaultMemberRole: e.target.value as Role })}
              className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none focus:border-cue-400"
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {mutation.error && <ErrorNote message={mutation.error} />}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary !px-5 !py-2.5">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {mutation.status === 'success' && <span className="text-sm text-cue-200">Saved.</span>}
        </div>
      </form>
    </SectionCard>
  );
}
