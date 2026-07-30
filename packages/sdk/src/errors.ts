/**
 * SDK error type. Wraps an RFC 9457 problem+json body so callers can switch on
 * the machine-readable `code` (never on the HTTP status).
 */
import type { AppErrorCode, ProblemDetails } from '@cue/types';

export class CueApiError extends Error {
  readonly status: number;
  readonly code: AppErrorCode | 'UNKNOWN';
  readonly problem: ProblemDetails | undefined;
  readonly requestId: string | undefined;

  constructor(status: number, problem?: ProblemDetails, fallbackMessage?: string) {
    super(problem?.detail ?? problem?.title ?? fallbackMessage ?? `HTTP ${String(status)}`);
    this.name = 'CueApiError';
    this.status = status;
    this.code = problem?.code ?? 'UNKNOWN';
    this.problem = problem;
    this.requestId = problem?.requestId;
  }
}

/** Type guard for `problem+json`-shaped bodies. */
export function isProblemDetails(value: unknown): value is ProblemDetails {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v['code'] === 'string' && typeof v['status'] === 'number';
}
