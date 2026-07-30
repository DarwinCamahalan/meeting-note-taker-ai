/**
 * RFC 9457 problem+json machinery. `AppException` is the app's typed error: it
 * carries the machine-readable {@link AppErrorCode} that clients switch on
 * (never the HTTP status). Helper constructors keep call sites terse.
 */
import type { AppErrorCode, FieldError, ProblemDetails } from '@cue/types';
import type { ZodError } from 'zod';

/** Stable, dereferenceable error-type base (per 22-api-contracts.md §4). */
export const ERROR_TYPE_BASE = 'https://errors.usecue.app/';

/** Extra problem+json members an error may attach beyond the core fields. */
export type ProblemExtras = Pick<
  ProblemDetails,
  'errors' | 'entitlementKey' | 'retryAfterMs' | 'instance'
>;

interface CodeMeta {
  status: number;
  title: string;
}

/** Default HTTP status + human title for each error code. */
const CODE_META: Record<AppErrorCode, CodeMeta> = {
  AUTH_INVALID_TOKEN: { status: 401, title: 'Invalid or expired token' },
  AUTH_DEVICE_UNBOUND: { status: 401, title: 'Device not bound' },
  AUTH_STEP_UP_REQUIRED: { status: 401, title: 'Step-up authentication required' },
  FORBIDDEN_ROLE: { status: 403, title: 'Insufficient role' },
  ENTITLEMENT_REQUIRED: { status: 403, title: 'Entitlement required' },
  QUOTA_LIVE_MINUTES: { status: 429, title: 'Live-minutes quota exceeded' },
  VALIDATION_FAILED: { status: 422, title: 'Request validation failed' },
  IDEMPOTENCY_CONFLICT: { status: 409, title: 'Idempotency key conflict' },
  RATE_LIMITED: { status: 429, title: 'Rate limited' },
  NOT_FOUND: { status: 404, title: 'Resource not found' },
  CONFLICT: { status: 409, title: 'Conflict' },
  UPSTREAM_STT: { status: 502, title: 'Upstream STT error' },
  UPSTREAM_LLM: { status: 502, title: 'Upstream LLM error' },
  UPSTREAM_BILLING: { status: 502, title: 'Upstream billing error' },
  INTERNAL: { status: 500, title: 'Internal server error' },
};

/** The app's typed HTTP error. Caught by the global {@link AllExceptionsFilter}. */
export class AppException extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly title: string;
  readonly extras: ProblemExtras;

  constructor(code: AppErrorCode, detail?: string, extras: ProblemExtras = {}) {
    const meta = CODE_META[code];
    super(detail ?? meta.title);
    this.name = 'AppException';
    this.code = code;
    this.status = meta.status;
    this.title = meta.title;
    this.extras = extras;
  }

  /** Serialize to an RFC 9457 body (drops undefined optional members). */
  toProblem(requestId?: string): ProblemDetails {
    const problem: ProblemDetails = {
      type: ERROR_TYPE_BASE + slug(this.code),
      title: this.title,
      status: this.status,
      code: this.code,
    };
    if (this.message && this.message !== this.title) problem.detail = this.message;
    if (this.extras.instance !== undefined) problem.instance = this.extras.instance;
    if (this.extras.errors !== undefined) problem.errors = this.extras.errors;
    if (this.extras.entitlementKey !== undefined) problem.entitlementKey = this.extras.entitlementKey;
    if (this.extras.retryAfterMs !== undefined) problem.retryAfterMs = this.extras.retryAfterMs;
    if (requestId !== undefined) problem.requestId = requestId;
    return problem;
  }
}

function slug(code: AppErrorCode): string {
  return code.toLowerCase().replace(/_/g, '-');
}

/* -------- terse constructors -------- */

export const notFound = (detail?: string): AppException => new AppException('NOT_FOUND', detail);
export const conflict = (detail?: string): AppException => new AppException('CONFLICT', detail);
export const unauthorized = (detail?: string): AppException =>
  new AppException('AUTH_INVALID_TOKEN', detail);
export const forbidden = (detail?: string): AppException =>
  new AppException('FORBIDDEN_ROLE', detail);
export const internal = (detail?: string): AppException => new AppException('INTERNAL', detail);

/** Build a VALIDATION_FAILED problem from a Zod parse error. */
export function validationFailed(error: ZodError): AppException {
  const errors: FieldError[] = error.issues.map((issue) => ({
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
  return new AppException('VALIDATION_FAILED', 'One or more fields are invalid.', { errors });
}
