/**
 * Regional admission control for live sessions (docs/70-scalability §2.2, §2.3,
 * §4.4, §6, ADR-70.3).
 *
 * Each live session holds exactly one concurrent STT stream, so STT concurrency
 * == concurrent sessions — the hard external ceiling. Claude RPM is derived
 * (sessions × ~4 cues/min). This service meters a session's admission against
 * BOTH per-region ceilings and hands out a lease released on teardown.
 *
 * Scope + honesty about what this is:
 *  - The production admission budget is a per-region **control-Redis token
 *    bucket** (§2.3): genuinely regional, never a shared global counter.
 *  - This in-process counter is the conservative **per-instance local budget**
 *    that §2.6 specifies as the fail-open fallback when control Redis is briefly
 *    unavailable — used standalone here until the Redis bucket is wired.
 *  - Overload NEVER evicts an in-flight session (§6.2). At the ceiling a NEW
 *    session is admitted in `transcript-only` mode (cues deferred) rather than
 *    rejected (§6.1) — the STT lease is still granted so the ribbon stays live.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ORCHESTRATOR_CONFIG, type OrchestratorEnv } from '../config/env.js';

/** Session cue mode granted by admission. */
export type AdmissionMode = 'live' | 'transcript-only';

/** A granted admission lease; `release()` is idempotent. */
export interface AdmissionLease {
  readonly mode: AdmissionMode;
  release(): void;
}

/** Point-in-time admission utilization, for metrics/logs (no PII). */
export interface AdmissionSnapshot {
  readonly region: string;
  readonly activeSessions: number;
  readonly sessionCeiling: number;
  readonly sttConcurrency: number;
  readonly claudeRpmLimit: number;
}

/** Modeled cues/min per live session (70 §3.5) — derives RPM from concurrency. */
const CUES_PER_MIN = 4;

@Injectable()
export class AdmissionControlService {
  private readonly logger = new Logger(AdmissionControlService.name);
  private readonly region: string;
  private readonly sttConcurrency: number;
  private readonly claudeRpmLimit: number;
  private readonly sessionCeiling: number;

  private active = 0;

  constructor(@Inject(ORCHESTRATOR_CONFIG) config: OrchestratorEnv) {
    this.region = config.region ?? 'unknown';
    this.sttConcurrency = config.sttConcurrency;
    this.claudeRpmLimit = config.claudeRpmLimit;
    this.sessionCeiling = computeSessionCeiling(this.sttConcurrency, this.claudeRpmLimit);
    if (this.sessionCeiling > 0) {
      this.logger.log(
        `admission budget [${this.region}]: <= ${String(this.sessionCeiling)} concurrent sessions ` +
          `(stt=${String(this.sttConcurrency)}, claudeRpm=${String(this.claudeRpmLimit)})`,
      );
    } else {
      this.logger.warn('admission control DISABLED (no per-region ceilings set) — dev fail-open.');
    }
  }

  /**
   * Admit a session. Always grants a lease (in-flight protection + STT ribbon),
   * but downgrades new sessions to `transcript-only` once the regional ceiling
   * is reached, per the §6 overload ladder.
   */
  acquire(): AdmissionLease {
    this.active++;
    const overCeiling = this.sessionCeiling > 0 && this.active > this.sessionCeiling;
    const mode: AdmissionMode = overCeiling ? 'transcript-only' : 'live';
    if (overCeiling) {
      this.logger.warn(
        `admission over ceiling [${this.region}] — new session degraded to transcript-only ` +
          `(${String(this.active)}/${String(this.sessionCeiling)})`,
      );
    }
    let released = false;
    return {
      mode,
      release: (): void => {
        if (released) return;
        released = true;
        this.active = Math.max(0, this.active - 1);
      },
    };
  }

  snapshot(): AdmissionSnapshot {
    return {
      region: this.region,
      activeSessions: this.active,
      sessionCeiling: this.sessionCeiling,
      sttConcurrency: this.sttConcurrency,
      claudeRpmLimit: this.claudeRpmLimit,
    };
  }
}

/**
 * Effective concurrent-session ceiling = the tighter of the STT concurrency
 * ceiling and (Claude RPM / cues-per-session-min). `0` on either dimension
 * means "unlimited"; `0` overall disables the gate.
 */
export function computeSessionCeiling(sttConcurrency: number, claudeRpmLimit: number): number {
  const fromRpm = claudeRpmLimit > 0 ? Math.floor(claudeRpmLimit / CUES_PER_MIN) : 0;
  const limits = [sttConcurrency, fromRpm].filter((n) => n > 0);
  return limits.length > 0 ? Math.min(...limits) : 0;
}
