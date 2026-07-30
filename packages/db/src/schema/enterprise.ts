/**
 * Enterprise domain (Phase 3): per-org SSO connections (WorkOS) + org
 * invitations. See 40-authentication.md (SSO/SCIM) and 30-data-model.md §3.2.
 *
 * Reuses `org_role` (from _shared) for invite roles and the existing
 * `audit_logs` table for admin-sensitive event capture — neither is duplicated
 * here. Additive to the Phase 0-2 schema.
 */
import { index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { orgRoleEnum, primaryId, timestamps } from './_shared.js';
import { orgs, users } from './identity.js';

/** Identity-federation protocol backing a connection (mirrors @cue/types SsoProvider). */
export const ssoProviderEnum = pgEnum('sso_provider', ['saml', 'oidc', 'authkit']);

/** Provisioning lifecycle of a WorkOS connection (mirrors SsoConnectionStatus). */
export const ssoConnectionStatusEnum = pgEnum('sso_connection_status', [
  'draft',
  'validating',
  'active',
  'inactive',
]);

/** Invitation lifecycle (mirrors @cue/types InviteStatus). */
export const inviteStatusEnum = pgEnum('invite_status', [
  'pending',
  'accepted',
  'revoked',
  'expired',
]);

/**
 * Per-org WorkOS SSO connection. One org may claim multiple domains, each with
 * its own connection row; `domain` routes an SSO login to the right IdP.
 */
export const ssoConnections = pgTable(
  'sso_connections',
  {
    id: primaryId(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    provider: ssoProviderEnum('provider').notNull(),
    /** WorkOS Connection id (`conn_...`); null until the connection is created. */
    workosConnectionId: text('workos_connection_id'),
    /** WorkOS Organization id (`org_...`) the connection belongs to. */
    workosOrganizationId: text('workos_organization_id').notNull(),
    domain: text('domain').notNull(),
    status: ssoConnectionStatusEnum('status').notNull().default('draft'),
    ...timestamps,
  },
  (t) => ({
    byOrg: index('sso_connections_org_idx').on(t.orgId),
    /** A domain resolves to exactly one connection (SSO login routing key). */
    domainUk: unique('sso_connections_domain_uk').on(t.domain),
    /** Each WorkOS connection maps to one row (NULLs remain distinct). */
    workosConnUk: unique('sso_connections_workos_conn_uk').on(t.workosConnectionId),
  }),
);

/**
 * Org membership invitation. `token` is the opaque accept credential (single
 * unique row); role reuses `org_role` so accepted invites map straight onto
 * `org_members.role`.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: primaryId(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: orgRoleEnum('role').notNull().default('member'),
    /** Opaque single-use accept token (hashed at the app layer). */
    token: text('token').notNull(),
    status: inviteStatusEnum('status').notNull().default('pending'),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => ({
    tokenUk: unique('invitations_token_uk').on(t.token),
    byOrg: index('invitations_org_idx').on(t.orgId),
    byEmail: index('invitations_email_idx').on(t.email),
  }),
);
