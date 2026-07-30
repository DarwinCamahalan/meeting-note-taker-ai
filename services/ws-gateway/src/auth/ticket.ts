/**
 * WS ticket verification. `api` mints a single-use, short-lived ES256 JWT
 * (docs/22 §5.2) carrying `{ sub, sid, did, jti, aud:"ws-gateway", exp }`.
 * The gateway verifies signature + audience + expiry with jose, then the caller
 * enforces one-time use via the replay guard.
 *
 * The public key is loaded once (env, ES256 SPKI PEM); no secret ever touches
 * the wire and the private key never lives in this service.
 */
import { importSPKI, jwtVerify, type JWTPayload, type KeyLike } from 'jose';
import type { WsErrorCode } from '@cue/types';

/** Verified ticket claims the connection binds its session to. */
export interface TicketClaims {
  /** Subject — the authenticated user id. */
  userId: string;
  /** Session id this ticket authorizes (JWT `sid`). */
  sessionId: string;
  /** Device id the ticket is bound to (JWT `did`). */
  deviceId: string;
  /** Unique ticket id for the one-time-use replay guard (JWT `jti`). */
  jti: string;
  /** Expiry, epoch seconds (JWT `exp`). */
  exp: number;
  /** Optional session-context claims `api` MAY embed to skip a DB round-trip. */
  ext: TicketExtClaims;
}

/**
 * Optional session-context claims. When absent the ai-orchestrator resolves the
 * full session record from `sessionId`. Kept narrow + optional so the minimal
 * `{sub,sid,did,jti,aud,exp}` ticket in docs/22 §5.2 still verifies.
 */
export interface TicketExtClaims {
  orgId?: string;
  dataRegion?: string;
  mode?: string;
  language?: string;
  disclosed?: boolean;
  documentIds?: string[];
}

/** Typed verification failure carrying the WS error code to relay/close on. */
export class TicketError extends Error {
  constructor(
    readonly code: Extract<WsErrorCode, 'WS_TICKET_INVALID' | 'WS_TICKET_EXPIRED'>,
    message: string,
  ) {
    super(message);
    this.name = 'TicketError';
  }
}

function readString(payload: JWTPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new TicketError('WS_TICKET_INVALID', `ticket missing string claim: ${key}`);
  }
  return value;
}

function readExt(payload: JWTPayload): TicketExtClaims {
  const ext: TicketExtClaims = {};
  if (typeof payload['org'] === 'string') ext.orgId = payload['org'];
  if (typeof payload['region'] === 'string') ext.dataRegion = payload['region'];
  if (typeof payload['mode'] === 'string') ext.mode = payload['mode'];
  if (typeof payload['lang'] === 'string') ext.language = payload['lang'];
  if (typeof payload['disc'] === 'boolean') ext.disclosed = payload['disc'];
  if (Array.isArray(payload['docs']) && payload['docs'].every((d) => typeof d === 'string')) {
    ext.documentIds = payload['docs'] as string[];
  }
  return ext;
}

/** Verifies + parses a WS ticket. Throws {@link TicketError} on any failure. */
export class TicketVerifier {
  private constructor(
    private readonly key: KeyLike,
    private readonly audience: string,
  ) {}

  /** Import the ES256 SPKI public key once at startup. */
  static async create(publicKeyPem: string, audience: string): Promise<TicketVerifier> {
    const key = await importSPKI(publicKeyPem, 'ES256');
    return new TicketVerifier(key, audience);
  }

  async verify(token: string): Promise<TicketClaims> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.key, {
        algorithms: ['ES256'],
        audience: this.audience,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ticket verification failed';
      const expired = message.includes('exp');
      throw new TicketError(
        expired ? 'WS_TICKET_EXPIRED' : 'WS_TICKET_INVALID',
        `ticket rejected: ${message}`,
      );
    }
    if (typeof payload.exp !== 'number') {
      throw new TicketError('WS_TICKET_INVALID', 'ticket missing exp');
    }
    return {
      userId: readString(payload, 'sub'),
      sessionId: readString(payload, 'sid'),
      deviceId: readString(payload, 'did'),
      jti: readString(payload, 'jti'),
      exp: payload.exp,
      ext: readExt(payload),
    };
  }
}
