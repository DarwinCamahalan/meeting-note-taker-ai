/**
 * GatewayServer — owns the HTTP listener (health), the `ws` WebSocketServer, the
 * shared gRPC client channel to ai-orchestrator, and the process-wide auth
 * replay guard + resume store. Each accepted socket becomes a
 * {@link SessionConnection}.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { createOrchestratorClient, type OrchestratorClient } from '@cue/proto';
import type { GatewayConfig } from './config.js';
import { TicketVerifier } from './auth/ticket.js';
import { ReplayGuard } from './auth/replay-store.js';
import { ResumeStore } from './resume/offset-store.js';
import { SessionConnection } from './connection.js';
import { SUBPROTOCOL, TICKET_PROTOCOL_PREFIX } from './constants.js';
import { log } from './logger.js';

export class GatewayServer {
  private readonly http: Server;
  private readonly wss: WebSocketServer;
  private readonly replay = new ReplayGuard();
  private readonly resume = new ResumeStore();

  private constructor(
    private readonly config: GatewayConfig,
    private readonly verifier: TicketVerifier,
    private readonly client: OrchestratorClient,
  ) {
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
  static async create(config: GatewayConfig): Promise<GatewayServer> {
    const verifier = await TicketVerifier.create(config.jwtPublicKeyPem, config.ticketAudience);
    // One shared HTTP/2 channel; each connection opens its own `Stream` call.
    const client = createOrchestratorClient(config.orchestratorAddr);
    return new GatewayServer(config, verifier, client);
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
    log.debug('connection accepted', { connId, hasSubprotocolTicket: Boolean(subprotocolTicket) });
  }

  /** Graceful shutdown for SIGTERM/SIGINT (ECS task drain). */
  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    await new Promise<void>((resolve) => this.http.close(() => resolve()));
    this.client.close();
  }
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
