import { WebSocket, type RawData } from 'ws';
import type { CuePipeline } from '@cue/core';
import type { CueApiClient } from '@cue/sdk';
import {
  WS_AUDIO_FRAME,
  type AudioChunk,
  type ClientMsg,
  type CueEvent,
  type ServerMsg,
  type SessionKind,
  type SessionState,
  type TranscriptEvent,
  type WsSampleRate,
} from '@cue/types';

/**
 * Config for the gateway-backed pipeline. The api client is shared with the
 * AuthManager (so it carries live tokens + auto-refresh).
 */
export interface GatewayPipelineConfig {
  api: CueApiClient;
  /** Session kind created for this stream. */
  sessionKind: SessionKind;
  /** Optional ws-gateway URL override; else the ws-ticket's `wsUrl` is used. */
  wsUrlOverride?: string;
  disclosed?: boolean;
  language?: string;
  /** Uplink sample rate (must match the desktop capture; Phase 0 = 16 kHz). */
  sampleRate?: WsSampleRate;
  /** Max automatic reconnect attempts on an unexpected socket close. */
  maxReconnects?: number;
}

/** How long to wait for the server's `ready` after the socket opens. */
const READY_TIMEOUT_MS = 10_000;
const PROTOCOL = 'cue.v1' as const;

/**
 * A {@link CuePipeline} that streams through `ws-gateway` instead of running
 * `@cue/core` in-process. Drop-in for the Phase 0 orchestrator: the desktop
 * main process treats it identically (`start`/`stop`/`pushAudio`/`on*`).
 *
 * Wire protocol (per 22 §5, mirrored in @cue/types):
 *   - JWT auth via the ticket in the FIRST message (`hello`), never a query arg.
 *   - Binary PCM16 frames with a 4-byte header (@cue/types `WS_AUDIO_FRAME`).
 *   - JSON control/data envelopes relayed back as Transcript/Cue/State.
 *   - Heartbeat + seq-offset resume on reconnect.
 */
export class GatewayPipeline implements CuePipeline {
  private readonly cfg: GatewayPipelineConfig;
  private readonly sampleRate: WsSampleRate;

  private ws: WebSocket | undefined;
  private started = false;
  /** True only while a graceful stop() is tearing the socket down. */
  private closing = false;

  private sessionId: string | undefined;
  private frameSeq = 0;
  /** Last committed final-transcript seq, for resume-from on reconnect. */
  private lastSeq = 0;
  private reconnects = 0;
  private heartbeat: ReturnType<typeof setInterval> | undefined;

  private stateCb: ((s: SessionState) => void) | undefined;
  private transcriptCb: ((t: TranscriptEvent) => void) | undefined;
  private cueCb: ((e: CueEvent) => void) | undefined;

  constructor(cfg: GatewayPipelineConfig) {
    this.cfg = cfg;
    this.sampleRate = cfg.sampleRate ?? 16000;
  }

  async start(): Promise<void> {
    if (this.started) return;
    if (!this.cfg.api.getTokens()?.access_token) {
      this.setState('error');
      throw new Error('Not signed in — run login() before starting a gateway session.');
    }
    this.started = true;
    this.reconnects = 0;
    try {
      await this.connect(false);
    } catch (err) {
      this.started = false;
      this.setState('error');
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    this.closing = true;
    this.clearHeartbeat();
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      this.sendControl({ t: 'end' });
      ws.close(1000, 'client-stop');
    }
    this.ws = undefined;
    this.closing = false;
    this.setState('idle');
  }

  pushAudio(chunk: AudioChunk): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(encodeAudioFrame(chunk, this.nextFrameSeq()));
  }

  onState(cb: (s: SessionState) => void): void {
    this.stateCb = cb;
  }

  onTranscript(cb: (t: TranscriptEvent) => void): void {
    this.transcriptCb = cb;
  }

  onCue(cb: (e: CueEvent) => void): void {
    this.cueCb = cb;
  }

  /* --- Connection lifecycle --- */

  /**
   * Create a session (once) + mint a fresh single-use ws-ticket, open the
   * socket, send `hello`, and resolve when the server replies `ready`.
   */
  private async connect(isResume: boolean): Promise<void> {
    if (!isResume) {
      const session = await this.cfg.api.sessions.create({
        kind: this.cfg.sessionKind,
        ...(this.cfg.disclosed !== undefined ? { disclosed: this.cfg.disclosed } : {}),
        ...(this.cfg.language ? { language: this.cfg.language } : {}),
      });
      this.sessionId = session.id;
    }
    if (!this.sessionId) throw new Error('No session id to mint a ws-ticket for.');

    // Tickets are single-use, so mint one per (re)connect.
    const ticket = await this.cfg.api.sessions.wsTicket(this.sessionId);
    const url = this.cfg.wsUrlOverride ?? ticket.wsUrl;

    await this.openSocket(url, ticket.ticket, isResume ? this.lastSeq : undefined);
  }

  private openSocket(url: string, ticket: string, resumeFrom: number | undefined): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url, [PROTOCOL]);
      this.ws = ws;

      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error('Timed out waiting for ws-gateway `ready`.'));
      }, READY_TIMEOUT_MS);

      let ready = false;

      ws.on('open', () => {
        this.frameSeq = 0;
        const hello: ClientMsg = {
          t: 'hello',
          protocol: PROTOCOL,
          ticket,
          codec: 'pcm16',
          sampleRate: this.sampleRate,
          ...(resumeFrom !== undefined ? { resumeFrom } : {}),
        };
        ws.send(JSON.stringify(hello));
      });

      ws.on('message', (data: RawData, isBinary: boolean) => {
        if (isBinary) return; // server never sends binary on this channel
        const msg = parseServerMsg(data);
        if (!msg) return;
        if (msg.t === 'ready' && !ready) {
          ready = true;
          clearTimeout(timer);
          this.onReady(msg.heartbeatSec);
          resolve();
        }
        this.handleServerMsg(msg);
      });

      ws.on('error', (err: Error) => {
        if (!ready) {
          clearTimeout(timer);
          reject(err);
        }
      });

      ws.on('close', () => {
        clearTimeout(timer);
        this.clearHeartbeat();
        if (ready && this.started && !this.closing) {
          void this.tryReconnect();
        }
      });
    });
  }

  private onReady(heartbeatSec: number): void {
    this.setState('listening');
    this.clearHeartbeat();
    const periodMs = Math.max(1, heartbeatSec) * 1000;
    this.heartbeat = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendControl({ t: 'heartbeat', ts: Date.now() });
      }
    }, periodMs);
  }

  /** Reconnect with the last-seen seq offset; give up after `maxReconnects`. */
  private async tryReconnect(): Promise<void> {
    const max = this.cfg.maxReconnects ?? 3;
    if (this.reconnects >= max) {
      this.setState('error');
      this.started = false;
      return;
    }
    this.reconnects += 1;
    const backoffMs = Math.min(5_000, 500 * 2 ** (this.reconnects - 1));
    await new Promise((r) => setTimeout(r, backoffMs));
    if (!this.started) return;
    try {
      await this.connect(true);
    } catch {
      if (this.started) void this.tryReconnect();
    }
  }

  /* --- Server -> client mapping (ServerMsg -> Phase 0 event contracts) --- */

  private handleServerMsg(msg: ServerMsg): void {
    switch (msg.t) {
      case 'transcript.partial':
        this.emitTranscript({ kind: 'partial', text: msg.text, ts: msg.ts });
        break;
      case 'transcript.final':
        this.lastSeq = msg.seq;
        this.emitTranscript({ kind: 'final', text: msg.text, ts: msg.endMs });
        this.setState('listening');
        break;
      case 'cue.delta':
        this.setState('cue');
        this.emitCue({ kind: 'delta', id: msg.cueId, text: msg.text });
        break;
      case 'cue.final':
        // Deltas already built the text in the store; just settle this cue.
        this.emitCue({ kind: 'done', id: msg.cueId });
        this.setState('listening');
        break;
      case 'session.finalizing':
        this.setState('thinking');
        break;
      case 'quota.exceeded':
        this.setState('error');
        break;
      case 'error':
        this.setState('error');
        console.error(`[cue] ws-gateway error ${msg.code}: ${msg.message}`);
        break;
      case 'ready':
      case 'heartbeat':
      case 'backpressure':
      case 'entitlements.updated':
        // No UI mapping (ready handled at connect; others are advisory).
        break;
      default:
        break;
    }
  }

  private sendControl(msg: ClientMsg): void {
    this.ws?.send(JSON.stringify(msg));
  }

  private nextFrameSeq(): number {
    const seq = this.frameSeq;
    this.frameSeq = (this.frameSeq + 1) & 0xffff;
    return seq;
  }

  private clearHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = undefined;
    }
  }

  private setState(state: SessionState): void {
    this.stateCb?.(state);
  }

  private emitTranscript(event: TranscriptEvent): void {
    this.transcriptCb?.(event);
  }

  private emitCue(event: CueEvent): void {
    this.cueCb?.(event);
  }
}

/**
 * Encode one PCM16 mic chunk into a binary uplink frame:
 *   [ type(1) | channel(1) | seq(uint16 LE) | payload... ]
 */
function encodeAudioFrame(chunk: AudioChunk, seq: number): Buffer {
  const header = Buffer.alloc(WS_AUDIO_FRAME.HEADER_BYTES);
  header[0] = WS_AUDIO_FRAME.TYPE_PCM16;
  header[1] = WS_AUDIO_FRAME.CHANNEL_MIC;
  header.writeUInt16LE(seq, 2);
  return Buffer.concat([header, Buffer.from(chunk.data)]);
}

/** Parse a JSON control frame into a typed {@link ServerMsg} (or drop it). */
function parseServerMsg(data: RawData): ServerMsg | undefined {
  try {
    const text = typeof data === 'string' ? data : data.toString('utf8');
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 't' in parsed) {
      return parsed as ServerMsg;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
