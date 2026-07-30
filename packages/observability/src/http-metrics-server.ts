/**
 * Standalone `/metrics` + `/readyz` + `/livez` HTTP surface for the non-NestJS
 * services (ws-gateway, ai-orchestrator). NestJS services get the exact same
 * three routes via the ObservabilityModule + ObservabilityController; this is
 * the framework-agnostic equivalent so a gRPC/ws process can be scraped and
 * probed identically without pulling `@nestjs/*` into its runtime.
 *
 * Node core `http` only — no Express/Fastify — so the realtime edge stays lean.
 * A non-`ok` readiness/liveness report is served with HTTP 503 so the ALB target
 * group drains (readiness) or the orchestrator restarts (liveness) the task.
 */
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { HealthRegistry, HealthReport } from './health.js';
import type { MetricsRegistry } from './metrics.js';

export interface ObservabilityServerOptions {
  /** The process metrics registry ( `/metrics` scrape target ). */
  readonly metrics: MetricsRegistry;
  /** The process health registry ( `/readyz` + `/livez` ). */
  readonly health: HealthRegistry;
  /** Port to bind (e.g. `METRICS_PORT`). */
  readonly port: number;
  /** Bind host; defaults to all interfaces. */
  readonly host?: string;
  /** Called once the listener is bound (structured-log hook). */
  readonly onListen?: (port: number) => void;
}

/** A running observability server with a graceful {@link close}. */
export interface ObservabilityServer {
  readonly server: Server;
  close(): Promise<void>;
}

/**
 * Start the standalone observability HTTP server. Any route other than the three
 * canonical ones returns 404 — this listener exists only for scrape + probes and
 * never carries application traffic.
 */
export function startObservabilityServer(options: ObservabilityServerOptions): ObservabilityServer {
  const { metrics, health, port, host, onListen } = options;

  const server = createServer((req, res) => {
    const path = (req.url ?? '').split('?', 1)[0];
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }
    void route(path, metrics, health, res);
  });

  server.listen(port, host, () => onListen?.(port));

  return {
    server,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function route(
  path: string | undefined,
  metrics: MetricsRegistry,
  health: HealthRegistry,
  res: ServerResponse,
): Promise<void> {
  try {
    switch (path) {
      case '/metrics': {
        const body = await metrics.metrics();
        res.writeHead(200, { 'content-type': metrics.contentType }).end(body);
        return;
      }
      case '/livez': {
        respondHealth(res, await health.liveness());
        return;
      }
      case '/readyz': {
        respondHealth(res, await health.readiness());
        return;
      }
      default:
        res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not_found"}');
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'internal error';
    res
      .writeHead(500, { 'content-type': 'application/json' })
      .end(JSON.stringify({ error: 'internal', detail }));
  }
}

function respondHealth(res: ServerResponse, report: HealthReport): void {
  const status = report.status === 'down' ? 503 : 200;
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(report));
}
