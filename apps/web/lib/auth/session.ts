/**
 * Server-only session access for the admin console. Reads the `cue_session`
 * cookie via `next/headers`, hydrates a {@link CueApiClient}, and resolves the
 * caller's identity + roles for the `/admin` route guard.
 *
 * This module MUST NOT be imported from a Client Component — `next/headers` is
 * server-only. Client hooks use `client-session.ts` instead.
 */
import { cookies } from 'next/headers';
import { CueApiClient, CueApiError } from '@cue/sdk';
import type { AuthTokens, MeResponse, OrgRole } from '@cue/types';
import { apiBaseUrl } from '@/lib/config/site';
import { SESSION_COOKIE } from './constants';
import { decodeTokens } from './tokens';

/** Roles that may enter the admin console (RBAC: owner + admin). */
const PRIVILEGED_ROLES: readonly OrgRole[] = ['owner', 'admin'];

/** True when the role set grants admin-console access. */
export function hasAdminAccess(roles: readonly OrgRole[]): boolean {
  return roles.some((role) => PRIVILEGED_ROLES.includes(role));
}

/** Read the signed-in tokens from the request cookies, or `null`. */
export async function getServerTokens(): Promise<AuthTokens | null> {
  const store = await cookies();
  return decodeTokens(store.get(SESSION_COOKIE)?.value);
}

/**
 * Build a server-side SDK client seeded with the request's tokens. Returns
 * `null` when the visitor is not signed in.
 */
export async function getServerClient(): Promise<CueApiClient | null> {
  const tokens = await getServerTokens();
  if (!tokens) return null;
  return new CueApiClient({ baseUrl: apiBaseUrl(), tokens });
}

/** Outcome of the admin-route authorization probe. */
export type AdminAuthResult =
  | { status: 'unauthenticated' }
  | { status: 'forbidden'; me: MeResponse }
  | { status: 'ok'; me: MeResponse; client: CueApiClient };

/**
 * Server-side `/admin` guard: verifies a session exists (`GET /v1/me`) and that
 * the caller holds a privileged role in the active org. The layout maps the
 * result to a redirect or renders the console.
 */
export async function resolveAdminAuth(): Promise<AdminAuthResult> {
  const client = await getServerClient();
  if (!client) return { status: 'unauthenticated' };

  let me: MeResponse;
  try {
    me = await client.me();
  } catch (err) {
    // 401 means the token is stale/invalid — treat as unauthenticated.
    if (err instanceof CueApiError && (err.status === 401 || err.status === 403)) {
      return { status: 'unauthenticated' };
    }
    throw err;
  }

  if (!hasAdminAccess(me.roles)) return { status: 'forbidden', me };
  return { status: 'ok', me, client };
}
