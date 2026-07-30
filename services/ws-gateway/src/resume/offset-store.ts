/**
 * Resume-via-offsets state (docs/22 §5.4). Every `*.final` frame carries a
 * monotonic `seq`; the gateway retains the recent finals per session so a
 * reconnect with `resumeFrom:<lastSeq>` replays only the missed finals (never
 * partials — those are disposable).
 *
 * MVP is in-process with a bounded ring + grace-window expiry. TODO(prod: Redis)
 * — persist last-emitted offset + buffered finals in Redis so resume survives an
 * ECS task replacement and works across instances; the gateway stays stateless.
 */
import { RESUME_BUFFER_SIZE, RESUME_GRACE_MS } from '../constants.js';
import type { OutboundFinal } from '../types.js';

interface SessionResumeState {
  finals: OutboundFinal[];
  lastSeq: number;
  updatedAt: number;
}

/** Outcome of a resume request against the store. */
export interface ResumeResult {
  /** Finals with `seq > resumeFrom`, in order, to replay to the client. */
  replay: OutboundFinal[];
  /** True when the request fell outside the grace window / had no state. */
  expired: boolean;
}

/** Per-session ring buffer of recent finals for reconnect replay. */
export class ResumeStore {
  private readonly sessions = new Map<string, SessionResumeState>();

  /** Append an emitted final so a later resume can replay it. */
  record(sessionId: string, final: OutboundFinal): void {
    const state = this.sessions.get(sessionId) ?? { finals: [], lastSeq: 0, updatedAt: 0 };
    state.finals.push(final);
    if (state.finals.length > RESUME_BUFFER_SIZE) state.finals.shift();
    state.lastSeq = Math.max(state.lastSeq, final.seq);
    state.updatedAt = Date.now();
    this.sessions.set(sessionId, state);
  }

  /** Compute the replay set for a `hello` carrying `resumeFrom`. */
  resume(sessionId: string, resumeFrom: number): ResumeResult {
    const state = this.sessions.get(sessionId);
    if (!state || Date.now() - state.updatedAt > RESUME_GRACE_MS) {
      return { replay: [], expired: true };
    }
    return { replay: state.finals.filter((f) => f.seq > resumeFrom), expired: false };
  }

  /** Drop a session's buffer (on clean end / purge). */
  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
