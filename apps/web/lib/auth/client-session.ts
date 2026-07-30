'use client';

/**
 * Browser-side access to the `cue_session` cookie for the admin console's
 * client hooks. The cookie is intentionally readable by JS (not httpOnly) so
 * the @cue/sdk client can attach the bearer token; the server guard reads the
 * same cookie via `next/headers`.
 *
 * SECURITY TODO(phase-3-hardening): a JS-readable refresh token is an XSS
 * exposure. Harden by moving to an httpOnly cookie + a same-origin token proxy
 * (Next route handlers) or a short-lived, silent-refresh access token only.
 * Tracked alongside the envelope-encryption TODO in the threat model.
 */
import type { AuthTokens } from '@cue/types';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from './constants';
import { decodeTokens, encodeTokens } from './tokens';

/** Read the current tokens from `document.cookie`, or `null`. */
export function readClientTokens(): AuthTokens | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${SESSION_COOKIE}=`));
  return decodeTokens(match?.slice(SESSION_COOKIE.length + 1));
}

/** Persist tokens to the session cookie (used after a client-side refresh). */
export function writeClientTokens(tokens: AuthTokens): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie =
    `${SESSION_COOKIE}=${encodeTokens(tokens)}; Path=/; Max-Age=${String(SESSION_MAX_AGE_SECONDS)}` +
    `; SameSite=Lax${secure}`;
}

/** Clear the session cookie (sign-out). */
export function clearClientTokens(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
