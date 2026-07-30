/** Pure helpers for the "Sign in with SSO" entrypoint. */

/** Extract the lowercased email domain (after `@`), or `null` if not an email. */
export function domainFromEmail(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain.includes('.') ? domain : null;
}

/**
 * Sanitize a post-sign-in return path: must be a same-origin absolute path
 * (`/...`) and never a protocol-relative (`//host`) or absolute URL. Falls back
 * to the admin console.
 */
export function safeReturnPath(raw: string | null | undefined, fallback = '/admin'): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  return raw;
}
