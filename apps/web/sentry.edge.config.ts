/**
 * Sentry Edge-runtime bootstrap for @cue/web (middleware / edge routes). Loaded
 * from `instrumentation.ts`'s `register()` when running on the edge runtime. A
 * no-op when no DSN is configured.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env['SENTRY_DSN'] ?? process.env['NEXT_PUBLIC_SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env['SENTRY_ENV'] ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}
