/**
 * Environment configuration for @cue/ws-gateway.
 *
 * Secrets and ports come exclusively from the process environment (see the
 * repo-root `.env.example`). Nothing is hardcoded. `loadConfig` fails fast with
 * an actionable message when a required variable is missing.
 */

/** Fully-resolved, validated runtime configuration. */
export interface GatewayConfig {
  /** Port the WS server listens on (default 3002, per WS_PORT). */
  readonly wsPort: number;
  /** host:port of the ai-orchestrator gRPC service this gateway dials. */
  readonly orchestratorAddr: string;
  /** ES256 public key (PEM SPKI) used to verify WS auth tickets. */
  readonly jwtPublicKeyPem: string;
  /** Audience claim every ticket must carry (locked to the gateway). */
  readonly ticketAudience: string;
  /** Port the standalone /metrics + /readyz + /livez server binds (METRICS_PORT). */
  readonly metricsPort: number;
  /** Region tag stamped on logs/metrics (AWS_REGION); undefined when unset. */
  readonly region: string | undefined;
  /**
   * Hard per-task ceiling on concurrent live WS connections (WS_MAX_CONNECTIONS,
   * 70 §2.1 / §3). New sockets past this are rejected `1013` (try again later)
   * so a task never oversubscribes; autoscaling targets ~60% of this. `0`
   * disables the cap (local dev).
   */
  readonly wsMaxConnections: number;
  /**
   * Max wall-clock to drain in-flight connections on SIGTERM before force-close
   * (SHUTDOWN_DRAIN_MS). Bounds ECS task stop time on a connection-draining
   * rolling deploy (70 §7). Default 30000.
   */
  readonly shutdownDrainMs: number;
}

/** The audience claim `api` stamps on WS tickets (docs/22 §5.2). */
export const TICKET_AUDIENCE = 'ws-gateway';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`[ws-gateway] missing required environment variable: ${name}`);
  }
  return value;
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`[ws-gateway] invalid port value: ${raw}`);
  }
  return port;
}

/** Parse a non-negative integer env knob, falling back when unset/blank. */
function parseCount(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`[ws-gateway] invalid non-negative integer: ${raw}`);
  }
  return value;
}

/**
 * Normalize a PEM key supplied via env. Accepts a real multi-line PEM, a
 * single-line PEM with literal `\n` escapes, or a base64-encoded PEM blob.
 */
export function normalizePem(raw: string): string {
  const unescaped = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
  if (unescaped.includes('-----BEGIN')) return unescaped.trim();
  // Not a PEM on its face — assume a base64-wrapped PEM blob.
  const decoded = Buffer.from(unescaped, 'base64').toString('utf8');
  if (!decoded.includes('-----BEGIN')) {
    throw new Error('[ws-gateway] JWT_PUBLIC_KEY is neither PEM nor base64-encoded PEM');
  }
  return decoded.trim();
}

/** Read + validate the environment into an immutable {@link GatewayConfig}. */
export function loadConfig(): GatewayConfig {
  return {
    wsPort: parsePort(process.env['WS_PORT'], 3002),
    orchestratorAddr: process.env['ORCHESTRATOR_GRPC_ADDR']?.trim() || 'localhost:50051',
    jwtPublicKeyPem: normalizePem(requireEnv('JWT_PUBLIC_KEY')),
    ticketAudience: TICKET_AUDIENCE,
    metricsPort: parsePort(process.env['METRICS_PORT'], 9464),
    region: process.env['AWS_REGION']?.trim() || undefined,
    wsMaxConnections: parseCount(process.env['WS_MAX_CONNECTIONS'], 5_000),
    shutdownDrainMs: parseCount(process.env['SHUTDOWN_DRAIN_MS'], 30_000),
  };
}
