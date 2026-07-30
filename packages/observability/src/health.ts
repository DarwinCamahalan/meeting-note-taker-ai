/**
 * Liveness / readiness probe helpers (per 60-devops §health-checks & ALB target
 * group probes).
 *
 * Split by intent: LIVENESS is shallow (is the event loop alive?) and must not
 * touch dependencies — a failing liveness probe makes the orchestrator KILL the
 * task. READINESS is deep (can we serve traffic? DB/Redis/provider reachable?)
 * — a failing readiness probe makes the load balancer DRAIN the task without
 * killing it, which is exactly what we want during a dependency blip or a
 * SIGTERM drain.
 */

export type HealthStatus = 'ok' | 'degraded' | 'down';

/** Outcome of a single named check. */
export interface HealthCheckResult {
  readonly status: HealthStatus;
  readonly detail?: string;
}

/** A check returns a full result, or a boolean shorthand (true=ok, false=down). */
export type HealthCheck = () =>
  | Promise<HealthCheckResult | boolean>
  | HealthCheckResult
  | boolean;

/** Aggregated probe report serialized to the `/readyz` and `/livez` routes. */
export interface HealthReport {
  readonly status: HealthStatus;
  readonly service: string;
  readonly ts: string;
  readonly checks: Record<string, HealthCheckResult>;
}

interface RegisteredCheck {
  readonly name: string;
  readonly check: HealthCheck;
  readonly timeoutMs: number;
}

/**
 * Holds a service's liveness + readiness checks and evaluates them into
 * {@link HealthReport}s. A single instance is shared per process (provided as a
 * NestJS singleton by the ObservabilityModule).
 */
export class HealthRegistry {
  private readonly livenessChecks: RegisteredCheck[] = [];
  private readonly readinessChecks: RegisteredCheck[] = [];
  private draining = false;

  constructor(private readonly serviceName: string) {}

  /** Register a shallow liveness check (avoid I/O here). */
  registerLiveness(name: string, check: HealthCheck, timeoutMs = 1000): void {
    this.livenessChecks.push({ name, check, timeoutMs });
  }

  /** Register a deep readiness check (DB/Redis/provider reachability). */
  registerReadiness(name: string, check: HealthCheck, timeoutMs = 2000): void {
    this.readinessChecks.push({ name, check, timeoutMs });
  }

  /**
   * Flip the process into draining mode: readiness immediately reports `down`
   * so the load balancer stops routing new traffic while in-flight work
   * finishes. Call from the SIGTERM handler before closing servers.
   */
  beginDraining(): void {
    this.draining = true;
  }

  /** Shallow liveness — ok unless an explicit liveness check fails. */
  async liveness(): Promise<HealthReport> {
    const checks = await this.run(this.livenessChecks);
    return this.report(checks);
  }

  /** Deep readiness — down while draining, else the worst of all checks. */
  async readiness(): Promise<HealthReport> {
    if (this.draining) {
      return {
        status: 'down',
        service: this.serviceName,
        ts: new Date().toISOString(),
        checks: { drain: { status: 'down', detail: 'shutting down' } },
      };
    }
    const checks = await this.run(this.readinessChecks);
    return this.report(checks);
  }

  private async run(registered: RegisteredCheck[]): Promise<Record<string, HealthCheckResult>> {
    const entries = await Promise.all(
      registered.map(async ({ name, check, timeoutMs }): Promise<[string, HealthCheckResult]> => {
        try {
          const result = await withTimeout(check(), timeoutMs);
          return [name, normalize(result)];
        } catch (error) {
          return [name, { status: 'down', detail: errMessage(error) }];
        }
      }),
    );
    return Object.fromEntries(entries);
  }

  private report(checks: Record<string, HealthCheckResult>): HealthReport {
    return {
      status: worstStatus(Object.values(checks)),
      service: this.serviceName,
      ts: new Date().toISOString(),
      checks,
    };
  }
}

function normalize(result: HealthCheckResult | boolean): HealthCheckResult {
  if (typeof result === 'boolean') return { status: result ? 'ok' : 'down' };
  return result;
}

function worstStatus(results: HealthCheckResult[]): HealthStatus {
  if (results.some((r) => r.status === 'down')) return 'down';
  if (results.some((r) => r.status === 'degraded')) return 'degraded';
  return 'ok';
}

async function withTimeout<T>(value: Promise<T> | T, timeoutMs: number): Promise<T> {
  if (!(value instanceof Promise)) return value;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`health check timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([value, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
