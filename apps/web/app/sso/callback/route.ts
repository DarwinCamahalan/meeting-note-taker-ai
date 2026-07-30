/**
 * SSO token handoff. The `api` `GET /v1/sso/callback` (server-only) exchanges
 * the WorkOS code, mints our first-party JWTs, then 302-redirects the browser
 * here with the tokens. This route persists them into the `cue_session` cookie
 * and forwards the user to their intended `return` path in the admin console.
 *
 * The api is a different origin, so it cannot set the web app's cookie directly;
 * this same-origin handler is the seam that does. Tokens live in the URL only
 * for this single hop and are stripped by the immediate redirect.
 *
 * TODO(api SsoModule): implement the callback contract this route consumes —
 *   302 `${WEB}/sso/callback?access_token=&refresh_token=&expires_in=&token_type=Bearer&return=<state>`.
 *   Harden later to a one-time code exchanged server-side to keep tokens fully
 *   out of the URL (tracked with the httpOnly-cookie hardening TODO).
 */
import { NextResponse, type NextRequest } from 'next/server';
import type { AuthTokens } from '@cue/types';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, ADMIN_HOME_PATH, SIGN_IN_PATH } from '@/lib/auth/constants';
import { encodeTokens } from '@/lib/auth/tokens';

export const dynamic = 'force-dynamic';

function safeReturn(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return ADMIN_HOME_PATH;
  return raw;
}

export function GET(request: NextRequest): NextResponse {
  const params = request.nextUrl.searchParams;
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const expiresIn = Number(params.get('expires_in'));
  const returnTo = safeReturn(params.get('return') ?? params.get('state'));

  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    const url = new URL(SIGN_IN_PATH, request.nextUrl.origin);
    url.searchParams.set('error', 'sso_handoff_failed');
    return NextResponse.redirect(url);
  }

  const tokens: AuthTokens = {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
  };

  const response = NextResponse.redirect(new URL(returnTo, request.nextUrl.origin));
  response.cookies.set({
    name: SESSION_COOKIE,
    value: encodeTokens(tokens),
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    // Intentionally NOT httpOnly — the client SDK reads this token. See
    // client-session.ts for the hardening TODO.
    httpOnly: false,
  });
  return response;
}
