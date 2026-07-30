/**
 * Minimal structured JSON logger. Zero deps — the realtime edge stays lean and
 * ships one line per event so it slots into any log pipeline (CloudWatch/OTel).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Structured, JSON-serializable log fields. */
export type LogFields = Record<string, string | number | boolean | null | undefined>;

function emit(level: LogLevel, msg: string, fields?: LogFields): void {
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    svc: 'ws-gateway',
    msg,
    ...fields,
  });
  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

/** Process-wide logger. Connection scopes attach `{ connId, sessionId }`. */
export const log = {
  debug: (msg: string, fields?: LogFields): void => emit('debug', msg, fields),
  info: (msg: string, fields?: LogFields): void => emit('info', msg, fields),
  warn: (msg: string, fields?: LogFields): void => emit('warn', msg, fields),
  error: (msg: string, fields?: LogFields): void => emit('error', msg, fields),
};
