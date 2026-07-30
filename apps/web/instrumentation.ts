/**
 * Next.js instrumentation hook (App Router). `register()` runs once per server
 * runtime at startup and loads the matching Sentry config; `onRequestError`
 * forwards server-side render/route errors to Sentry. Both are no-ops when no
 * DSN is configured. The browser is initialized separately by
 * `sentry.client.config.ts`.
 */
import * as Sentry from '@sentry/nextjs';

export async function register(): Promise<void> {
  if (process.env['NEXT_RUNTIME'] === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env['NEXT_RUNTIME'] === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
