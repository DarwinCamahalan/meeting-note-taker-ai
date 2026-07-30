/** JWT claim shapes issued/verified by {@link JwtService}. */
import type { DataRegion, OrgRole } from '@cue/types';
import type { JWTPayload } from 'jose';

/** Short-lived bearer token presented to protected REST endpoints. */
export interface AccessClaims extends JWTPayload {
  sub: string;
  org: string;
  email: string;
  region: DataRegion;
  roles: OrgRole[];
  typ: 'access';
}

/** Long-lived rotation token exchanged at `/v1/auth/refresh`. */
export interface RefreshClaims extends JWTPayload {
  sub: string;
  org: string;
  typ: 'refresh';
}

/** Single-use realtime ticket the ws-gateway verifies statelessly. */
export interface WsTicketClaims extends JWTPayload {
  sub: string;
  org: string;
  sid: string;
  typ: 'ws';
}
