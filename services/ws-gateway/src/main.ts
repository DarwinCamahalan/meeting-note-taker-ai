/**
 * @cue/ws-gateway entrypoint. Loads config from the environment, stands up the
 * observability surface (tracing + metrics + /metrics /readyz /livez), builds
 * the gateway (importing the ticket key + dialing ai-orchestrator), and listens
 * on WS_PORT. Wires graceful shutdown (readiness drain + telemetry flush) for
 * ECS task drain.
 */
// Telemetry must load before `ws`/`grpc` — keep this first.
import { flushTelemetry } from './instrumentation.js';
import {
  createMetrics,
  HealthRegistry,
  startObservabilityServer,
  type ObservabilityServer,
} from '@cue/observability';
import { loadConfig } from './config.js';
import { GatewayServer } from './server.js';
import { log } from './logger.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const metrics = createMetrics('ws-gateway');
  const health = new HealthRegistry('ws-gateway');
  const obsServer: ObservabilityServer = startObservabilityServer({
    metrics,
    health,
    port: config.metricsPort,
    onListen: (port) => log.info('observability server listening', { metricsPort: port }),
  });

  const server = await GatewayServer.create(config, { metrics, health });
  server.listen();

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('shutting down', { signal });
    // Flip readiness to `down` first so the ALB stops routing new sockets, then
    // drain the WS/gRPC layer, flush telemetry, and close the scrape server.
    health.beginDraining();
    void server
      .close()
      .then(() => flushTelemetry())
      .then(() => obsServer.close())
      .then(
        () => process.exit(0),
        (err: unknown) => {
          log.error('shutdown error', { err: err instanceof Error ? err.message : String(err) });
          process.exit(1);
        },
      );
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  log.error('fatal startup error', { err: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
