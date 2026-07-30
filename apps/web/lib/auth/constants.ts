/**
 * Web-session cookie contract shared by the server guard (`session.ts`, via
 * `next/headers`) and the browser SDK plumbing (`client-session.ts`, via
 * `document.cookie`). One source of truth for the signed-in tokens so the
 * server-side `/admin` role check and the client-side @cue/sdk hooks agree.
 */

/** Cookie holding the JSON-encoded {@link import('@cue/types').AuthTokens}. */
export const SESSION_COOKIE = 'cue_session' as const;

/** Cookie lifetime in seconds (30 days) — refresh-token bound, not access-token. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Where an unauthenticated / under-privileged visitor is sent from `/admin`.
 * The SSO sign-in entrypoint carries them back here via `return`.
 */
export const SIGN_IN_PATH = '/signin' as const;

/** Default post-sign-in destination for the admin console. */
export const ADMIN_HOME_PATH = '/admin' as const;
