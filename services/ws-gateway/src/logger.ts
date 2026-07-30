/**
 * Structured logger for @cue/ws-gateway, backed by the shared pino factory
 * (`@cue/observability`) so lines carry `service`/`region`, the active OTel
 * trace/span ids, and canonical PII/transcript redaction — identical to every
 * other Cue service.
 *
 * The public `log.info(msg, fields?)` shape is preserved so existing call sites
 * (and the connection scopes that attach `{ connId, sessionId }`) are unchanged;
 * internally we flip the argument order to pino's `(mergeObject, msg)` form.
 */
import { createLogger, type CueLogger } from '@cue/observability';

/** Structured, JSON-serializable log fields. */
export type LogFields = Record<string, string | number | boolean | null | undefined>;

const pino: CueLogger = createLogger('ws-gateway');

function emit(
  level: 'debug' | 'info' | 'warn' | 'error',
  msg: string,
  fields?: LogFields,
): void {
  if (fields) pino[level](fields, msg);
  else pino[level](msg);
}

/** Process-wide logger. Connection scopes attach `{ connId, sessionId }`. */
export const log = {
  debug: (msg: string, fields?: LogFields): void => emit('debug', msg, fields),
  info: (msg: string, fields?: LogFields): void => emit('info', msg, fields),
  warn: (msg: string, fields?: LogFields): void => emit('warn', msg, fields),
  error: (msg: string, fields?: LogFields): void => emit('error', msg, fields),
};
