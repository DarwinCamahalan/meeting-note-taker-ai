/**
 * Pure (de)serialization for the {@link AuthTokens} bundle carried in the
 * `cue_session` cookie. No I/O — safe to import from both server and client
 * halves of the auth layer.
 */
import type { AuthTokens } from '@cue/types';

function isAuthTokens(value: unknown): value is AuthTokens {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['access_token'] === 'string' &&
    typeof v['refresh_token'] === 'string' &&
    typeof v['expires_in'] === 'number'
  );
}

/** Encode tokens for a cookie value (URL-safe). */
export function encodeTokens(tokens: AuthTokens): string {
  return encodeURIComponent(JSON.stringify(tokens));
}

/** Parse a cookie value back into tokens, or `null` if malformed. */
export function decodeTokens(raw: string | undefined | null): AuthTokens | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    return isAuthTokens(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
