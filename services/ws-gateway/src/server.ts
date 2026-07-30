/**
 * GatewayServer — owns the HTTP listener (health), the `ws` WebSocketServer, the
 * shared gRPC client channel to ai-orchestrator, and the process-wide auth
 * replay guard + resume store. Each accepted socket becomes a
 * {@link SessionConnection}.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { createOrchestratorClient, grpc, type OrchestratorClient } from '@cue/proto';
import type { HealthRegistry, MetricsRegistry } from '@cue/observability';
import type { GatewayConfig } from './config.js';
import { TicketVerifier } from './auth/ticket.js';
import { ReplayGuard } from './auth/replay-store.js';
import { ResumeStore } from './resume/offset-store.js';
import { SessionConnection } from './connection.js';
import { CLOSE, SUBPROTOCOL, TICKET_PROTOCOL_PREFIX } from './constants.js';
import { log } from './logger.js';

/** Observability collaborators injected by main.ts (shared per process). */
export interface GatewayObservability {
  readonly metrics: MetricsRegistry;
  readonly health: HealthRegistry;
}

export class GatewayServer {
  private readonly http: Server;
  private readonly wss: WebSocketServer;
  private readonly replay = new ReplayGuard();
  private readonly resume = new ResumeStore();
  private readonly serviceLabel = 'ws-gateway';
  /** Live sockets, for the connection cap (70 §2.1) and SIGTERM drain (§7). */
  private readonly sockets = new Set<WebSocket>();
  /** Set once close() begins — new sockets are refused while draining. */
  private draining = false;

  private constructor(
    private readonly config: GatewayConfig,
    private readonly verifier: TicketVerifier,
    private readonly client: OrchestratorClient,
    private readonly obs: GatewayObservability,
  ) {
    this.registerReadiness();
    this.http = createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/healthz') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'ws-gateway' }));
        return;
      }
      res.writeHead(426, { 'content-type': 'text/plain' });
      res.end('Upgrade Required');
    });

    this.wss = new WebSocketServer({
      server: this.http,
      // Only ever negotiate `cue.v1`; a ticket subprotocol token rides alongside
      // it (§5.2) and is stripped here — never echoed back.
      handleProtocols: (protocols) => (protocols.has(SUBPROTOCOL) ? SUBPROTOCOL : false),
    });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
  }

  /** Build the server: import the ticket key + dial the orchestrator channel. */
  static async create(config: GatewayConfig, obs: GatewayObservability): Promise<GatewayServer> {
    const verifier = await TicketVerifier.create(config.jwtPublicKeyPem, config.ticketAudience);
    // One shared HTTP/2 channel; each connection opens its own `Stream` call.
    const client = createOrchestratorClient(config.orchestratorAddr);
    return new GatewayServer(config, verifier, client, obs);
  }

  /**
   * Deep readiness: report the orchestrator gRPC channel's connectivity so the
   * ALB drains this task when the upstream is unreachable. IDLE/READY are ok
   * (the channel connects lazily per stream); CONNECTING is degraded; a
   * transient failure or shutdown is down.
   */
  private registerReadiness(): void {
    this.obs.health.registerReadiness('orchestrator-channel', () => {
      const state = this.client.getChannel().getConnectivityState(false);
      if (state === grpc.connectivityState.TRANSIENT_FAILURE || state === grpc.connectivityState.SHUTDOWN) {
        return { status: 'down', detail: 'orchestrator channel unavailable' };
      }
      if (state === grpc.connectivityState.CONNECTING) return { status: 'degraded' };
      return { status: 'ok' };
    });
  }

  listen(): void {
    this.http.listen(this.config.wsPort, () => {
      log.info('ws-gateway listening', {
        wsPort: this.config.wsPort,
        orchestrator: this.config.orchestratorAddr,
      });
    });
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    // Refuse new sockets while draining (SIGTERM) or at the per-task ceiling
    // (70 §2.1). `1013` (Try Again Later) tells clients to reconnect elsewhere
    // — the ALB routes them to a task with headroom.
    if (this.draining) {
      ws.close(CLOSE.INTERNAL, 'server draining');
      return;
    }
    if (this.atCapacity()) {
      log.warn('connection cap reached — rejecting', {
        active: this.sockets.size,
        cap: this.config.wsMaxConnections,
      });
      ws.close(CLOSE.BACKPRESSURE_SHED, 'server at capacity');
      return;
    }

    const connId = randomUUID();
    const subprotocolTicket = extractSubprotocolTicket(req);
    const conn = new SessionConnection({
      ws,
      connId,
      verifier: this.verifier,
      replay: this.replay,
      resume: this.resume,
      client: this.client,
      ...(subprotocolTicket ? { subprotocolTicket } : {}),
    });
    conn.start();
    this.sockets.add(ws);
    ws.once('close', () => this.sockets.delete(ws));
    this.trackConnectionLifetime(ws);
    log.debug('connection accepted', { connId, hasSubprotocolTicket: Boolean(subprotocolTicket) });
  }

  /** True when the per-task connection ceiling is set and reached. */
  private atCapacity(): boolean {
    const cap = this.config.wsMaxConnections;
    return cap > 0 && this.sockets.size >= cap;
  }

  /**
   * Capacity/saturation SLIs: bump the active-connection gauge on accept and
   * release it on close, recording the socket's total lifetime (drain/deploy
   * behavior). No PII — labels are region + service only.
   */
  private trackConnectionLifetime(ws: WebSocket): void {
    const labels = { region: this.config.region ?? 'unknown', service: this.serviceLabel };
    const openedAt = Date.now();
    this.obs.metrics.sli.wsActiveConnections.inc(labels);
    ws.once('close', () => {
      this.obs.metrics.sli.wsActiveConnections.dec(labels);
      this.obs.metrics.sli.wsConnectionDurationS.observe((Date.now() - openedAt) / 1000);
    });
  }

  /**
   * Graceful shutdown for SIGTERM/SIGINT (ECS connection-draining deploy, 70
   * §7). Stops accepting new sockets, then waits up to `shutdownDrainMs` for
   * in-flight sessions to end naturally (the client resumes on a healthy task
   * within its 60s window) before force-closing the stragglers `1001`.
   */
  async close(): Promise<void> {
    this.draining = true;
    // Stop accepting: closes the listening side without touching live sockets.
    this.wss.close();

    await this.drainConnections();

    // Force-close any sockets that outlasted the drain budget.
    for (const ws of this.sockets) {
      ws.close(CLOSE.HEARTBEAT_MISS, 'server shutdown');
    }
    this.sockets.clear();

    await new Promise<void>((resolve) => this.http.close(() => resolve()));
    this.client.close();
  }

  /** Poll until all sockets close or the drain budget elapses. */
  private async drainConnections(): Promise<void> {
    const deadline = Date.now() + this.config.shutdownDrainMs;
    if (this.sockets.size > 0) {
      log.info('draining connections', { active: this.sockets.size, budgetMs: this.config.shutdownDrainMs });
    }
    while (this.sockets.size > 0 && Date.now() < deadline) {
      await delay(200);
    }
    if (this.sockets.size > 0) {
      log.warn('drain budget elapsed — forcing close', { remaining: this.sockets.size });
    }
  }
}

/** Promise-based delay for the drain poll loop. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pull a `ticket.<jwt>` token from the `Sec-WebSocket-Protocol` header (§5.2
 * subprotocol alternative — header-carried, never query string).
 */
function extractSubprotocolTicket(req: IncomingMessage): string | undefined {
  const header = req.headers['sec-websocket-protocol'];
  if (!header) return undefined;
  const tokens = (Array.isArray(header) ? header.join(',') : header)
    .split(',')
    .map((t) => t.trim());
  const ticket = tokens.find((t) => t.startsWith(TICKET_PROTOCOL_PREFIX));
  return ticket ? ticket.slice(TICKET_PROTOCOL_PREFIX.length) : undefined;
}
