/**
 * Sentry browser bootstrap for @cue/web. Loaded automatically by
 * `@sentry/nextjs`. A no-op when NEXT_PUBLIC_SENTRY_DSN is unset (dev/preview).
 *
 * Privacy: no session replay, and `sendDefaultPii` is false so IPs/cookies are
 * not attached. `beforeSend` strips request bodies/query strings as defense in
 * depth — the marketing site has no transcript data, but nothing sensitive
 * should ever leave regardless.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env['NEXT_PUBLIC_SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env['NEXT_PUBLIC_SENTRY_ENV'] ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.query_string;
      }
      return event;
    },
  });
}
