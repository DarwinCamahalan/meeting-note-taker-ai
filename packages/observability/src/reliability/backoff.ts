/**
 * Exponential backoff with full jitter (per 70-scalability §5.2 "Retries with
 * backoff").
 *
 * Contract from the spec:
 *  - idempotent internal calls: retry 3× with exponential backoff + FULL jitter
 *    (50ms base → 1s cap);
 *  - NEVER retry on the live-cue path — a retried cue is a late cue, which is a
 *    useless cue. Callers on that path must not use `retry`; they drop and let
 *    the next utterance produce a fresh cue.
 */

export interface BackoffOptions {
  /** Base delay in ms (attempt 0). Default 50. */
  baseMs?: number;
  /** Maximum delay in ms after exponential growth. Default 1000. */
  capMs?: number;
  /** Total attempts (including the first). Default 3. */
  maxAttempts?: number;
  /** Jitter strategy. `full` = random in [0, exp]; `none` = exact exp. Default `full`. */
  jitter?: 'full' | 'none';
  /** Predicate deciding whether a thrown error is retryable. Default: always. */
  isRetryable?: (error: unknown) => boolean;
  /** Abort signal to cancel between attempts. */
  signal?: AbortSignal;
  /** Observability hook fired before each delay. */
  onRetry?: (info: RetryInfo) => void;
  /** Injectable RNG for deterministic tests (returns [0,1)). Default Math.random. */
  random?: () => number;
  /** Injectable sleeper for deterministic tests. Default setTimeout-based. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface RetryInfo {
  /** Zero-based index of the attempt that just failed. */
  readonly attempt: number;
  /** Delay (ms) about to be waited before the next attempt. */
  readonly delayMs: number;
  /** The error that triggered the retry. */
  readonly error: unknown;
}

/**
 * Compute the delay before the retry that follows a zero-based `attempt`.
 * `exp = min(cap, base * 2^attempt)`; full jitter picks uniformly in `[0, exp]`.
 */
export function computeBackoffDelay(
  attempt: number,
  baseMs = 50,
  capMs = 1000,
  jitter: 'full' | 'none' = 'full',
  random: () => number = Math.random,
): number {
  const exp = Math.min(capMs, baseMs * 2 ** attempt);
  if (jitter === 'none') return exp;
  return Math.floor(random() * (exp + 1));
}

/**
 * Run `fn` with retries. Resolves with the first success; rejects with the last
 * error once attempts are exhausted or `isRetryable` returns false. The abort
 * signal short-circuits both the wait and further attempts.
 */
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: BackoffOptions = {},
): Promise<T> {
  const {
    baseMs = 50,
    capMs = 1000,
    maxAttempts = 3,
    jitter = 'full',
    isRetryable = () => true,
    signal,
    onRetry,
    random = Math.random,
    sleep = defaultSleep,
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    throwIfAborted(signal);
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const isLast = attempt === maxAttempts - 1;
      if (isLast || !isRetryable(error)) throw error;
      const delayMs = computeBackoffDelay(attempt, baseMs, capMs, jitter, random);
      onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs, signal);
    }
  }
  // Unreachable when maxAttempts >= 1; guards maxAttempts <= 0.
  throw lastError ?? new Error('retry: no attempts were made');
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = (): void => {
      cleanup();
      reject(abortError());
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    if (signal) {
      if (signal.aborted) {
        cleanup();
        reject(abortError());
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function abortError(): Error {
  const err = new Error('operation aborted');
  err.name = 'AbortError';
  return err;
}
