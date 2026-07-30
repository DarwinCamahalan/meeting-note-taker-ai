/**
 * Sentry crash/error reporting bootstrap (per 61-observability §crash-reporting).
 *
 * The `beforeSend` scrubber strips request bodies, credential headers, and any
 * denylisted field (§8) BEFORE the event leaves the process. Breadcrumbs are
 * kept event-name only. `initSentry` is a no-op when no DSN is configured, so
 * dev/test runs stay silent without branching at the call site.
 */
import * as Sentry from '@sentry/node';
import { isDenylistedKey, scrubDeep } from './redaction.js';

export interface InitSentryOptions {
  /** Sentry DSN; defaults to `SENTRY_DSN` env. When absent, init is skipped. */
  dsn?: string;
  /** Service name tag applied to every event. */
  serviceName: string;
  /** Environment (dev/staging/prod); defaults to `NODE_ENV`. */
  environment?: string;
  /** Release identifier; defaults to `SENTRY_RELEASE` env. */
  release?: string;
  /** Performance trace sample rate (0..1); defaults to 0 (errors only). */
  tracesSampleRate?: number;
}

/**
 * Initialize Sentry for a Node service. Returns whether it actually
 * initialized (false when no DSN is present).
 */
export function initSentry(options: InitSentryOptions): boolean {
  const dsn = options.dsn ?? process.env['SENTRY_DSN'];
  if (!dsn) return false;

  const release = options.release ?? process.env['SENTRY_RELEASE'];

  Sentry.init({
    dsn,
    environment: options.environment ?? process.env['NODE_ENV'] ?? 'development',
    ...(release ? { release } : {}),
    tracesSampleRate: options.tracesSampleRate ?? 0,
    // Never attach local variables / source that could contain transcript data.
    includeLocalVariables: false,
    initialScope: { tags: { service: options.serviceName } },
    beforeSend: sentryBeforeSend,
    beforeBreadcrumb: (breadcrumb) => {
      // Event-name only: drop breadcrumb data that could carry PII.
      delete breadcrumb.data;
      return breadcrumb;
    },
  });
  return true;
}

/**
 * `beforeSend` scrubber: removes request bodies, censors credential headers, and
 * deep-scrubs any denylisted field from `extra`/`contexts`. Exported so the
 * NestJS layer and tests can assert on it directly.
 */
export function sentryBeforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      event.request.headers = censorHeaders(event.request.headers);
    }
    // Query strings can carry identifiers; drop rather than risk leakage.
    delete event.request.query_string;
  }
  if (event.extra) event.extra = scrubDeep(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = scrubDeep(event.contexts) as typeof event.contexts;
  return event;
}

function censorHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = isDenylistedKey(key) ? '[redacted]' : value;
  }
  return out;
}

/** Capture an error with optional non-PII tags. Safe to call when uninitialized. */
export function captureError(error: unknown, tags?: Record<string, string>): void {
  Sentry.captureException(error, tags ? { tags } : undefined);
}

/** Flush pending events and close the client (graceful shutdown). */
export async function closeSentry(timeoutMs = 2000): Promise<void> {
  await Sentry.close(timeoutMs);
}
