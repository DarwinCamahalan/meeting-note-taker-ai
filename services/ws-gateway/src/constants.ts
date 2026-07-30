/**
 * Protocol constants for the realtime edge. Timings, limits, and WS close codes
 * are pinned here (docs/22 §5.3–5.4) so the server, connection, and backpressure
 * logic agree on one set of numbers.
 */

/** App-level heartbeat cadence, seconds (docs/22 §5.4). Echoed in `ready`. */
export const HEARTBEAT_SEC = 15;

/** Missed heartbeats tolerated before the server closes the socket (1001). */
export const HEARTBEAT_MISS_LIMIT = 2;

/** Deadline for the first (auth-bearing) frame after connect, ms. */
export const AUTH_DEADLINE_MS = 5_000;

/**
 * Egress backpressure watermark, bytes. When `ws.bufferedAmount` climbs past
 * this we emit `{t:'backpressure', level:'shed'}`; below it we emit `ok`.
 */
export const EGRESS_BUFFER_SHED_BYTES = 1_000_000;

/**
 * Ingress in-flight cap. If the gRPC uplink stays un-drained for this many
 * consecutive audio frames the connection is closed 1013 (WS_BACKPRESSURE).
 */
export const INGRESS_INFLIGHT_LIMIT = 256;

/** How many recent `*.final` frames to retain per session for resume replay. */
export const RESUME_BUFFER_SIZE = 512;

/** Resume grace window (ms). Past this a reconnect starts a fresh session. */
export const RESUME_GRACE_MS = 60_000;

/** WS close codes (docs/22 §5.3). */
export const CLOSE = {
  NORMAL: 1000,
  HEARTBEAT_MISS: 1001,
  INTERNAL: 1011,
  BACKPRESSURE_SHED: 1013,
  BAD_LATE_AUTH: 4400,
  TICKET_INVALID: 4401,
  QUOTA: 4402,
  FORBIDDEN: 4403,
  RATE_LIMITED: 4429,
} as const;

/** The only WS subprotocol this gateway speaks. */
export const SUBPROTOCOL = 'cue.v1';

/** `Sec-WebSocket-Protocol` token prefix that may carry the ticket (§5.2). */
export const TICKET_PROTOCOL_PREFIX = 'ticket.';
