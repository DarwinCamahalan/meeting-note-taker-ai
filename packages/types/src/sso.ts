/**
 * @cue/types/sso — Phase 3 Enterprise SSO / SCIM contract surface shared by the
 * `api` SsoModule (WorkOS AuthKit / SAML authorize + callback, admin connection
 * CRUD, and the SCIM directory-sync webhook), the web admin console, and the
 * typed SDK.
 *
 * WorkOS (@workos-inc/node) backs the enterprise path; the consumer OAuth2 PKCE
 * flow in `api.ts` stays intact and unaffected. These DTOs are transport-agnostic
 * plain data (survive JSON + structured-clone). Additive: tolerate unknowns.
 */
import type { AuthTokens, Org, User } from './api.js';

/* ------------------------------------------------------------------ *
 * SSO connections (per-org WorkOS connection projection)
 * ------------------------------------------------------------------ */

/**
 * The identity-federation protocol backing an org's SSO connection. `authkit`
 * is WorkOS's hosted multi-provider entrypoint; `saml`/`oidc` are direct
 * enterprise connections. Additive.
 */
export type SsoProvider = 'saml' | 'oidc' | 'authkit';

/**
 * Lifecycle of an SSO connection as it is provisioned + validated in WorkOS.
 * `active` is the only state that accepts logins.
 */
export type SsoConnectionStatus = 'draft' | 'validating' | 'active' | 'inactive';

/**
 * API view of an `sso_connections` row (@cue/db enterprise schema). WorkOS ids
 * are surfaced so the admin console can deep-link into the WorkOS dashboard, but
 * no secrets cross the wire.
 */
export interface SsoConnection {
  id: string;
  orgId: string;
  provider: SsoProvider;
  /** WorkOS Connection id (`conn_...`); null until the connection is created. */
  workosConnectionId: string | null;
  /** WorkOS Organization id (`org_...`) the connection belongs to. */
  workosOrganizationId: string;
  /** Email domain that routes to this connection (e.g. "acme.com"). */
  domain: string;
  status: SsoConnectionStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * `POST /v1/orgs/:orgId/sso/connections` request — provision a WorkOS connection
 * for the org. When `workosOrganizationId` is omitted the server creates the
 * WorkOS Organization first, then the connection.
 */
export interface CreateSsoConnectionRequest {
  provider: SsoProvider;
  /** Email domain to bind the connection to. */
  domain: string;
  /** Reuse an existing WorkOS Organization instead of creating one. */
  workosOrganizationId?: string;
}

/* ------------------------------------------------------------------ *
 * SSO authorize (AuthKit / SAML login entrypoint)
 * ------------------------------------------------------------------ */

/**
 * `GET /v1/sso/authorize` query — resolve a WorkOS authorization URL for an org
 * or an email domain. Exactly one of `organizationId`/`connectionId`/`domain`
 * is required to route the user to the right IdP.
 */
export interface SsoAuthorizeRequest {
  /** WorkOS Organization id (`org_...`) to authenticate against. */
  organizationId?: string;
  /** WorkOS Connection id (`conn_...`) to authenticate against. */
  connectionId?: string;
  /** Email domain the user typed at the "Sign in with SSO" entrypoint. */
  domain?: string;
  /** Absolute callback URL; falls back to WORKOS_REDIRECT_URI when omitted. */
  redirectUri?: string;
  /** Opaque CSRF/return-path state echoed back on the callback. */
  state?: string;
}

/** `GET /v1/sso/authorize` response — the WorkOS URL to redirect the browser to. */
export interface SsoAuthorizeResponse {
  /** WorkOS-hosted authorization URL (AuthKit or the org's SAML/OIDC IdP). */
  authorizationUrl: string;
}

/**
 * Result of a successful `GET /v1/sso/callback` code exchange: our first-party
 * JWTs plus the resolved (find-or-created) identity + org. The HTTP callback
 * typically 302-redirects to the web app with tokens; this is the typed shape
 * the SDK / tests assert against.
 */
export interface SsoCallbackResult {
  tokens: AuthTokens;
  user: User;
  org: Org;
}

/* ------------------------------------------------------------------ *
 * SCIM directory sync (WorkOS-signed webhook)
 * ------------------------------------------------------------------ */

/**
 * The WorkOS Directory Sync event types the SCIM webhook provisions/deprovisions
 * `org_members` from. Additive: unlisted events are acknowledged and ignored.
 */
export type ScimEventType =
  | 'dsync.user.created'
  | 'dsync.user.updated'
  | 'dsync.user.deleted'
  | 'dsync.group.user_added'
  | 'dsync.group.user_removed';
