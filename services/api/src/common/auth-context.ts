/**
 * The authenticated caller context, derived from a verified access token by
 * {@link JwtAuthGuard} and attached to the Express request. Read it in
 * handlers with the `@CurrentUser()` param decorator.
 */
import type { DataRegion, OrgRole } from '@cue/types';
import type { Request } from 'express';

export interface AuthContext {
  userId: string;
  orgId: string;
  email: string;
  region: DataRegion;
  roles: OrgRole[];
}

/** Express request augmented with the resolved auth context. */
export interface AuthedRequest extends Request {
  authContext?: AuthContext;
}
