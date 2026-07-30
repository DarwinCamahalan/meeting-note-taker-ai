'use client';

import { useState, type FormEvent } from 'react';
import type { CreateInviteRequest, Role } from '@cue/types';
import { assignableRolesFor, roleLabel } from '../utils/roles';
import type { AsyncState } from '../types';

/**
 * Invite-by-email form. The role picker is constrained to what the acting admin
 * may grant (owners can grant any role; admins cannot grant owner).
 */
export function InviteForm({
  actorRole,
  mutation,
  onInvite,
}: {
  actorRole: Role;
  mutation: AsyncState;
  onInvite: (body: CreateInviteRequest) => Promise<unknown>;
}): React.JSX.Element {
  const roles = assignableRolesFor(actorRole);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const submitting = mutation.status === 'loading';

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    const result = await onInvite({ email: trimmed, role });
    if (result) setEmail('');
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex-1">
        <span className="mb-1.5 block text-xs uppercase tracking-widest text-white/40">Work email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@acme.com"
          className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-cue-400"
        />
      </label>
      <label className="sm:w-40">
        <span className="mb-1.5 block text-xs uppercase tracking-widest text-white/40">Role</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none focus:border-cue-400"
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={submitting} className="btn-primary !px-5 !py-2.5">
        {submitting ? 'Sending…' : 'Send invite'}
      </button>
    </form>
  );
}
