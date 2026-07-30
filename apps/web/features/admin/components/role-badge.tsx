import type { Role } from '@cue/types';
import { roleLabel } from '../utils/roles';

/** Small colored pill for an org role. */
export function RoleBadge({ role }: { role: Role }): React.JSX.Element {
  const cls =
    role === 'owner'
      ? 'border-cue-300/40 bg-cue-500/20 text-cue-50'
      : role === 'admin'
        ? 'border-cue-400/25 bg-cue-500/10 text-cue-100'
        : 'border-white/15 bg-white/5 text-white/70';
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {roleLabel(role)}
    </span>
  );
}
