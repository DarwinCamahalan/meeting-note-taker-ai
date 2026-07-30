/**
 * Sentry Node/server bootstrap for @cue/web (App Router server runtime). Loaded
 * from `instrumentation.ts`'s `register()`. A no-op when SENTRY_DSN is unset.
 * Server-side may see request headers, so credential headers and bodies are
 * scrubbed in `beforeSend`.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env['SENTRY_DSN'] ?? process.env['NEXT_PUBLIC_SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env['SENTRY_ENV'] ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.query_string;
        if (event.request.headers) {
          for (const key of Object.keys(event.request.headers)) {
            if (/^(authorization|cookie|set-cookie)$/i.test(key)) {
              event.request.headers[key] = '[redacted]';
            }
          }
        }
      }
      return event;
    },
  });
}
