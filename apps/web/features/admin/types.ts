/**
 * View-model types for the admin console. Wire DTOs come from @cue/types; these
 * describe the console's own client-side shapes (nav, async request state, the
 * server-seeded context passed into the client shell).
 */
import type { Org, Role, User } from '@cue/types';

/** A left-nav entry in the admin shell. */
export interface AdminNavItem {
  href: string;
  label: string;
  /** Inline glyph key rendered by the nav. */
  icon: AdminNavIcon;
  /** Requires the `org.admin` entitlement (Team plan) to be meaningful. */
  gated?: boolean;
}

export type AdminNavIcon = 'overview' | 'members' | 'sso' | 'settings' | 'billing';

/**
 * The identity/org context the server layout resolves once (via the SDK) and
 * hands to the client shell. Consumed through {@link AdminContextValue}.
 */
export interface AdminBootstrap {
  user: User;
  org: Org;
  /** Highest RBAC role the caller holds in this org. */
  role: Role;
}

/** Context surfaced to every admin panel via `useAdminContext()`. */
export interface AdminContextValue extends AdminBootstrap {
  /** Convenience: the active org id (equals `org.id`). */
  orgId: string;
}

/** Generic async-request status for the console hooks. */
export type RequestStatus = 'idle' | 'loading' | 'success' | 'error';

/** A tiny async-result envelope used by the mutation hooks. */
export interface AsyncState {
  status: RequestStatus;
  error: string | null;
}
