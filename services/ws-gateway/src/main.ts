/**
 * @cue/ws-gateway entrypoint. Loads config from the environment, builds the
 * gateway (importing the ticket key + dialing ai-orchestrator), and listens on
 * WS_PORT. Wires graceful shutdown for ECS task drain.
 */
import { loadConfig } from './config.js';
import { GatewayServer } from './server.js';
import { log } from './logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const server = await GatewayServer.create(config);
  server.listen();

  const shutdown = (signal: string): void => {
    log.info('shutting down', { signal });
    void server.close().then(
      () => process.exit(0),
      (err) => {
        log.error('shutdown error', { err: String(err) });
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
