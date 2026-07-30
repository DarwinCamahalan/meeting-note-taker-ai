/**
 * SessionConnection — one WS client bridged to one ai-orchestrator gRPC
 * `Stream` RPC (docs/22 §5). Responsibilities:
 *   - enforce first-message / subprotocol ticket auth (never query string)
 *   - open + own the per-connection gRPC duplex stream
 *   - relay binary audio → AudioChunk (uplink), ServerEnvelope → cue.v1 (downlink)
 *   - app-level heartbeat, backpressure guard, resume-via-seq-offset replay
 *
 * Transport only: no AI logic, no DB, and Redis is off the per-frame path.
 */
import type { RawData, WebSocket } from 'ws';
import type { OrchestratorClient, ServerEnvelope, StartSession } from '@cue/proto';
import type { ClientMsg, ServerMsg, WsErrorCode, WsCodec, WsSampleRate } from '@cue/types';
import { TicketVerifier, TicketError, type TicketClaims } from './auth/ticket.js';
import type { ReplayGuard } from './auth/replay-store.js';
import type { ResumeStore } from './resume/offset-store.js';
import {
  AUTH_DEADLINE_MS,
  CLOSE,
  EGRESS_BUFFER_SHED_BYTES,
  HEARTBEAT_MISS_LIMIT,
  HEARTBEAT_SEC,
  INGRESS_INFLIGHT_LIMIT,
} from './constants.js';
import { decodeAudioFrame, encodeControl, parseControl } from './protocol/frames.js';
import { toAudioChunk, toProtoCodec, toProtoSessionMode, toServerMsg } from './protocol/mapping.js';
import { log } from './logger.js';

/** Collaborators a connection needs; owned by the server, shared across conns. */
export interface ConnectionDeps {
  readonly ws: WebSocket;
  readonly connId: string;
  readonly verifier: TicketVerifier;
  readonly replay: ReplayGuard;
  readonly resume: ResumeStore;
  readonly client: OrchestratorClient;
  /** Ticket carried in `Sec-WebSocket-Protocol` (§5.2 alternative), if any. */
  readonly subprotocolTicket?: string;
}

type Phase = 'awaiting-auth' | 'live' | 'closing';

/** The per-session gRPC duplex, derived from the proto client (no direct grpc dep). */
type OrchestratorStream = ReturnType<OrchestratorClient['Stream']>;

export class SessionConnection {
  private phase: Phase = 'awaiting-auth';
  private claims: TicketClaims | null = null;
  private grpc: OrchestratorStream | null = null;

  private authTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastClientHeartbeatAt = Date.now();
  private inFlightAudio = 0;
  private shedding = false;
  private readonly muted = { mic: false, loopback: false };

  constructor(private readonly deps: ConnectionDeps) {}

  /** Wire up listeners + the auth deadline. Called once by the server. */
  start(): void {
    const { ws } = this.deps;
    ws.on('message', (data: RawData, isBinary: boolean) => this.onMessage(data, isBinary));
    ws.on('close', () => this.dispose('client-close'));
    ws.on('error', (err) => {
      log.warn('ws error', { connId: this.deps.connId, err: String(err) });
      this.dispose('ws-error');
    });

    this.authTimer = setTimeout(() => {
      if (this.phase === 'awaiting-auth') {
        log.warn('auth deadline exceeded', { connId: this.deps.connId });
        this.fail('WS_AUTH_TIMEOUT', CLOSE.BAD_LATE_AUTH, 'auth deadline exceeded');
      }
    }, AUTH_DEADLINE_MS);

    // Subprotocol path (§5.2): the ticket may arrive at the handshake. We still
    // require the client's first application message to be `hello` (carrying
    // codec/sampleRate/resumeFrom); the subprotocol ticket just pre-supplies auth.
  }

  /* ----------------------------- message intake ----------------------------- */

  private onMessage(data: RawData, isBinary: boolean): void {
    if (this.phase === 'closing') return;
    if (isBinary) {
      this.onBinary(data);
      return;
    }
    const raw = Array.isArray(data) ? Buffer.concat(data).toString('utf8') : data.toString('utf8');
    const msg = parseControl(raw);
    if (!msg) {
      log.warn('malformed control frame', { connId: this.deps.connId });
      return;
    }
    void this.onControl(msg);
  }

  private onBinary(data: RawData): void {
    // Audio is only valid once the session is live.
    if (this.phase !== 'live' || !this.grpc) return;
    const buf = Array.isArray(data)
      ? Buffer.concat(data)
      : Buffer.isBuffer(data)
        ? data
        : Buffer.from(data as ArrayBuffer);
    const frame = decodeAudioFrame(buf);
    if (!frame) return;
    if (frame.channel === 0x01 && this.muted.mic) return;
    if (frame.channel === 0x02 && this.muted.loopback) return;

    const chunk = toAudioChunk(frame);
    const wrote = this.grpc.write({ kind: 'audio', audio: chunk });
    this.trackUplinkBackpressure(wrote);
  }

  private async onControl(msg: ClientMsg): Promise<void> {
    switch (msg.t) {
      case 'hello':
        await this.onHello(msg);
        return;
      case 'heartbeat':
        this.lastClientHeartbeatAt = Date.now();
        this.send({ t: 'heartbeat', ts: Date.now() });
        return;
      case 'mute':
        if (this.phase === 'live') this.muted[msg.channel] = msg.muted;
        return;
      case 'mode':
        // Mid-stream disclosure toggle. The simplified 3+3 proto has no mode
        // field; the orchestrator reads disclosure from StartSession. TODO
        // (orchestrator): a Control message to flip disclosure mid-session.
        return;
      case 'ask':
        // Manual prompt injection. No slot in the start/audio/stop oneof; MVP
        // no-ops. TODO(orchestrator): an explicit Ask RPC / control envelope.
        log.debug('ask ignored (no proto slot in MVP)', { connId: this.deps.connId });
        return;
      case 'end':
        this.endSession();
        return;
      default:
        return;
    }
  }

  /* -------------------------------- auth/hello ------------------------------ */

  private async onHello(
    msg: Extract<ClientMsg, { t: 'hello' }>,
  ): Promise<void> {
    if (this.phase !== 'awaiting-auth') {
      // A second hello on a live socket is a protocol violation.
      this.fail('WS_TICKET_INVALID', CLOSE.BAD_LATE_AUTH, 'duplicate hello');
      return;
    }
    if (msg.protocol !== 'cue.v1') {
      this.fail('WS_PROTOCOL_UNSUPPORTED', CLOSE.BAD_LATE_AUTH, 'unsupported protocol');
      return;
    }

    const token = this.deps.subprotocolTicket ?? msg.ticket;
    if (!token) {
      this.fail('WS_TICKET_INVALID', CLOSE.TICKET_INVALID, 'missing ticket');
      return;
    }

    let claims: TicketClaims;
    try {
      claims = await this.deps.verifier.verify(token);
    } catch (err) {
      if (err instanceof TicketError) {
        this.fail(err.code, CLOSE.TICKET_INVALID, err.message);
      } else {
        this.fail('WS_TICKET_INVALID', CLOSE.TICKET_INVALID, 'ticket verification error');
      }
      return;
    }

    // One-time-use replay guard (SETNX-equivalent). Consume exactly once.
    if (!this.deps.replay.claim(claims.jti, claims.exp)) {
      this.fail('WS_TICKET_REPLAY', CLOSE.TICKET_INVALID, 'ticket already used');
      return;
    }

    this.claims = claims;
    this.clearAuthTimer();
    this.openStream(msg, claims);
  }

  private openStream(
    hello: Extract<ClientMsg, { t: 'hello' }>,
    claims: TicketClaims,
  ): void {
    const stream = this.deps.client.Stream();
    this.grpc = stream;
    this.phase = 'live';

    stream.on('data', (env: ServerEnvelope) => this.onServerEnvelope(env));
    stream.on('error', (err) => {
      // No cue.v1 error code models an upstream failure (the WsErrorCode union is
      // ticket/auth/resume/backpressure/quota only). Signal via the 1011 close
      // code rather than a misleading typed error frame.
      // TODO(protocol): add a WS_UPSTREAM code so clients can distinguish this.
      log.error('gRPC stream error', { connId: this.deps.connId, err: String(err) });
      this.close(CLOSE.INTERNAL, 'orchestrator stream error');
    });
    stream.on('end', () => this.dispose('grpc-end'));

    stream.write({ kind: 'start', start: this.buildStart(hello, claims) });

    // Resume replay (§5.4): re-send finals the client missed, then `ready`.
    let resumedFrom: number | undefined;
    if (typeof hello.resumeFrom === 'number') {
      const { replay, expired } = this.deps.resume.resume(claims.sessionId, hello.resumeFrom);
      if (expired) {
        this.send({ t: 'error', code: 'WS_RESUME_EXPIRED', message: 'resume window elapsed' });
      } else {
        for (const final of replay) this.send(final.msg);
        resumedFrom = hello.resumeFrom;
      }
    }

    this.send(
      resumedFrom === undefined
        ? { t: 'ready', sessionId: claims.sessionId, heartbeatSec: HEARTBEAT_SEC }
        : { t: 'ready', sessionId: claims.sessionId, heartbeatSec: HEARTBEAT_SEC, resumedFrom },
    );
    this.startHeartbeat();
    log.info('session live', {
      connId: this.deps.connId,
      sessionId: claims.sessionId,
      userId: claims.userId,
      codec: hello.codec as WsCodec,
      sampleRate: hello.sampleRate as WsSampleRate,
    });
  }

  private buildStart(
    hello: Extract<ClientMsg, { t: 'hello' }>,
    claims: TicketClaims,
  ): StartSession {
    // Ext claims (org/region/mode/…) are optional; when absent the orchestrator
    // resolves the full session record from `sessionId`.
    return {
      sessionId: claims.sessionId,
      orgId: claims.ext.orgId ?? '',
      userId: claims.userId,
      dataRegion: claims.ext.dataRegion ?? '',
      mode: toProtoSessionMode(claims.ext.mode),
      format: { codec: toProtoCodec(hello.codec), sampleRate: hello.sampleRate, channels: 1 },
      documentIds: claims.ext.documentIds ?? [],
      disclosed: claims.ext.disclosed ?? false,
      language: claims.ext.language ?? 'en',
      resumeFromSeq: hello.resumeFrom ?? 0,
    };
  }

  /* ------------------------------ downlink relay ---------------------------- */

  private onServerEnvelope(env: ServerEnvelope): void {
    if (env.kind === 'cue' && env.cue.kind === 'CUE_ERROR') {
      log.warn('orchestrator cue error', {
        connId: this.deps.connId,
        cueId: env.cue.id,
        detail: env.cue.text,
      });
    }
    const msg = toServerMsg(env);
    if (!msg) return;
    // Persist finals for resume before sending (so a drop mid-send still replays).
    if (msg.t === 'transcript.final' || msg.t === 'cue.final') {
      this.deps.resume.record(this.claims!.sessionId, { seq: msg.seq, msg });
    }
    this.send(msg);
  }

  /* ------------------------------- heartbeat -------------------------------- */

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const missedMs = Date.now() - this.lastClientHeartbeatAt;
      if (missedMs > HEARTBEAT_SEC * 1000 * HEARTBEAT_MISS_LIMIT) {
        log.warn('heartbeat miss — closing', { connId: this.deps.connId, missedMs });
        this.close(CLOSE.HEARTBEAT_MISS, 'heartbeat miss');
        return;
      }
      this.send({ t: 'heartbeat', ts: Date.now() });
    }, HEARTBEAT_SEC * 1000);
  }

  /* ------------------------------ backpressure ------------------------------ */

  /** Egress + ingress backpressure guard (§5.4). */
  private trackUplinkBackpressure(lastWriteAccepted: boolean): void {
    this.inFlightAudio = lastWriteAccepted
      ? Math.max(0, this.inFlightAudio - 1)
      : this.inFlightAudio + 1;

    const overIngress = this.inFlightAudio >= INGRESS_INFLIGHT_LIMIT;
    const overEgress = this.deps.ws.bufferedAmount > EGRESS_BUFFER_SHED_BYTES;

    if (overIngress) {
      log.warn('ingress in-flight cap — closing', {
        connId: this.deps.connId,
        inFlight: this.inFlightAudio,
      });
      this.fail('WS_BACKPRESSURE', CLOSE.BACKPRESSURE_SHED, 'ingress buffer exceeded');
      return;
    }

    const shouldShed = overEgress;
    if (shouldShed !== this.shedding) {
      this.shedding = shouldShed;
      this.send({ t: 'backpressure', level: shouldShed ? 'shed' : 'ok' });
    }
  }

  /* -------------------------------- teardown -------------------------------- */

  private endSession(): void {
    this.send({ t: 'session.finalizing' });
    if (this.grpc) {
      this.grpc.write({ kind: 'stop', stop: {} });
      this.grpc.end();
    }
    this.close(CLOSE.NORMAL, 'client end');
  }

  private send(msg: ServerMsg): void {
    if (this.deps.ws.readyState !== this.deps.ws.OPEN) return;
    this.deps.ws.send(encodeControl(msg));
  }

  /** Emit an error frame then close with the mapped WS code. */
  private fail(code: WsErrorCode, closeCode: number, detail: string): void {
    this.send({ t: 'error', code, message: detail });
    this.close(closeCode, detail);
  }

  private close(code: number, reason: string): void {
    if (this.phase === 'closing') return;
    this.phase = 'closing';
    try {
      this.deps.ws.close(code, reason.slice(0, 120));
    } catch {
      this.deps.ws.terminate();
    }
    this.teardownTimers();
    this.grpc?.cancel();
    this.grpc = null;
  }

  private dispose(cause: string): void {
    if (this.phase === 'closing') {
      this.teardownTimers();
      return;
    }
    this.phase = 'closing';
    log.info('connection disposed', { connId: this.deps.connId, cause });
    this.teardownTimers();
    if (this.grpc) {
      try {
        this.grpc.end();
      } catch {
        this.grpc.cancel();
      }
      this.grpc = null;
    }
  }

  private teardownTimers(): void {
    this.clearAuthTimer();
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearAuthTimer(): void {
    if (this.authTimer) {
      clearTimeout(this.authTimer);
      this.authTimer = null;
    }
  }
}
