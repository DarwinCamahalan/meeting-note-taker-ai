/**
 * pino structured-logging factory (per 61-observability §2 "Structured logging
 * — pino, all services, redacted").
 *
 * Every logger created here:
 *  - binds `service` and (optionally) `region` so lines are attributable;
 *  - injects the active OpenTelemetry `trace_id` / `span_id` on every line via a
 *    `mixin`, so logs and traces correlate without manual plumbing;
 *  - applies the canonical {@link PII_DENYLIST} redaction at the source, so
 *    transcript/PII content can never be written even if a field slips into a
 *    log object.
 */
import { trace } from '@opentelemetry/api';
import { pino, type Logger, type LoggerOptions } from 'pino';
import { REDACTION_CENSOR, buildRedactPaths } from './redaction.js';

/** A pino logger instance. Re-exported alias so consumers don't import pino. */
export type CueLogger = Logger;

export interface CreateLoggerOptions {
  /** Log level; defaults to `LOG_LEVEL` env or `info`. */
  level?: string;
  /** Region tag (e.g. `us-east-1`); defaults to `AWS_REGION` env when unset. */
  region?: string;
  /** Pretty-print for local dev. Defaults to true only when NODE_ENV=development. */
  pretty?: boolean;
  /** Extra static bindings added to every line (must be non-PII). */
  base?: Record<string, string | number | boolean>;
}

/** Inject the active trace/span ids onto every log line for log↔trace correlation. */
function traceMixin(): Record<string, string> {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const ctx = span.spanContext();
  if (!ctx.traceId || ctx.traceId === '00000000000000000000000000000000') return {};
  return { trace_id: ctx.traceId, span_id: ctx.spanId };
}

/**
 * Create the canonical pino logger for a service. Idempotent to call per module;
 * prefer creating one root logger per service and `.child()`-ing for scope.
 */
export function createLogger(serviceName: string, options: CreateLoggerOptions = {}): CueLogger {
  const level = options.level ?? process.env['LOG_LEVEL'] ?? 'info';
  const region = options.region ?? process.env['AWS_REGION'];
  const pretty = options.pretty ?? process.env['NODE_ENV'] === 'development';

  const opts: LoggerOptions = {
    level,
    base: {
      service: serviceName,
      ...(region ? { region } : {}),
      ...(options.base ?? {}),
    },
    // ISO timestamps; no PID/hostname bloat beyond `base`.
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: {
      paths: buildRedactPaths(),
      censor: REDACTION_CENSOR,
    },
    mixin: traceMixin,
  };

  if (pretty) {
    opts.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
    };
  }

  return pino(opts);
}
