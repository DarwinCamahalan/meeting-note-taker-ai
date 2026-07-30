/**
 * Canonical PII / transcript redaction contract (per 61-observability §8 "the
 * hard rule: telemetry never carries transcript content or PII").
 *
 * Redaction is applied at the *source* SDK — before anything leaves the process
 * — via three enforcers that all consume THIS list: the pino `redact` config
 * ({@link logger.ts}), the Sentry `beforeSend` scrubber ({@link sentry.ts}), and
 * (in a follow-up) the OTel span-attribute allowlist. The Cue log/event schema
 * deliberately has no transcript/PII fields; this is defense-in-depth so a
 * future field name can never leak content.
 */

/** The redaction placeholder written in place of a denylisted value. */
export const REDACTION_CENSOR = '[redacted]';

/**
 * Field names that must never appear in telemetry. Covers transcript/cue
 * content, direct identifiers, and credential material. Matched case-sensitively
 * by exact key at any nesting depth (see {@link buildRedactPaths}); keep entries
 * as the exact casing used in code.
 */
export const PII_DENYLIST: readonly string[] = [
  // --- transcript & model content (the product's most sensitive data) ---
  'transcript',
  'transcripts',
  'transcriptText',
  'partial',
  'partials',
  'utterance',
  'utterances',
  'cueText',
  'cue_text',
  'promptText',
  'completion',
  'content',
  'text',
  'fileContent',
  'fileContents',
  'documentText',
  'chunkText',
  // --- direct identifiers ---
  'email',
  'phone',
  'fullName',
  'firstName',
  'lastName',
  'address',
  'ssn',
  'dob',
  'ipAddress',
  // --- credentials / secrets ---
  'password',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'authorization',
  'cookie',
  'setCookie',
] as const;

/**
 * Expand the denylist into pino `redact.paths` covering the top level plus two
 * nested levels via single-level wildcards (`*.field`, `*.*.field`). pino's
 * wildcard only spans one level, so we enumerate depths explicitly. Also covers
 * the conventional HTTP shapes (`req.headers.*`, `res.headers.*`).
 */
export function buildRedactPaths(fields: readonly string[] = PII_DENYLIST): string[] {
  const paths = new Set<string>();
  for (const field of fields) {
    paths.add(field);
    paths.add(`*.${field}`);
    paths.add(`*.*.${field}`);
    // Common HTTP serializer shapes emitted by pino-http / Nest requests.
    paths.add(`req.headers.${field.toLowerCase()}`);
    paths.add(`res.headers.${field.toLowerCase()}`);
  }
  // Always scrub the two headers that carry credentials regardless of casing.
  paths.add('req.headers.authorization');
  paths.add('req.headers.cookie');
  paths.add('res.headers["set-cookie"]');
  return [...paths];
}

/** Fast membership test used by the Sentry scrubber to walk arbitrary objects. */
const DENYSET = new Set<string>(PII_DENYLIST.map((f) => f.toLowerCase()));

/** True when `key` is a denylisted field name (case-insensitive). */
export function isDenylistedKey(key: string): boolean {
  return DENYSET.has(key.toLowerCase());
}

/**
 * Recursively deep-clone `value`, replacing any denylisted key's value with the
 * censor. Cycle-safe and depth-bounded so a hostile/large payload can't stall
 * the telemetry path. Used by the Sentry `beforeSend` scrubber where paths are
 * not known ahead of time.
 */
export function scrubDeep(value: unknown, maxDepth = 6): unknown {
  return scrubInner(value, maxDepth, new WeakSet<object>());
}

function scrubInner(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth <= 0) return '[truncated]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => scrubInner(item, depth - 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isDenylistedKey(key) ? REDACTION_CENSOR : scrubInner(item, depth - 1, seen);
  }
  return out;
}
