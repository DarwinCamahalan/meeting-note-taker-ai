/**
 * Identity domain: orgs, users, org_members, devices.
 * See 30-data-model.md §3.2 and 40-authentication.md (PKCE + device binding).
 */
import { boolean, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import {
  dataRegionEnum,
  orgRoleEnum,
  planEnum,
  primaryId,
  softDelete,
  timestamps,
} from './_shared.js';

export const orgs = pgTable(
  'orgs',
  {
    id: primaryId(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    plan: planEnum('plan').notNull().default('free'),
    dataRegion: dataRegionEnum('data_region').notNull(),
    /** Personal org auto-provisioned for consumer/Free users. */
    isPersonal: boolean('is_personal').notNull().default(false),
    stripeCustomerId: text('stripe_customer_id'),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    slugUk: unique('orgs_slug_uk').on(t.slug),
    regionIdx: index('orgs_region_idx').on(t.dataRegion),
  }),
);

export const users = pgTable(
  'users',
  {
    id: primaryId(),
    email: text('email').notNull(),
    /** External IdP subject (Clerk / WorkOS). MVP dev users get a synthetic id. */
    clerkUserId: text('clerk_user_id').notNull(),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    dataRegion: dataRegionEnum('data_region').notNull(),
    /** Opt-OUT of model training by default. */
    trainingOptOut: boolean('training_opt_out').notNull().default(true),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    emailUk: unique('users_email_uk').on(t.email),
    clerkUk: unique('users_clerk_uk').on(t.clerkUserId),
  }),
);

export const orgMembers = pgTable(
  'org_members',
  {
    id: primaryId(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: orgRoleEnum('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    memberUk: unique('org_members_uk').on(t.orgId, t.userId),
    byUser: index('org_members_user_idx').on(t.userId),
  }),
);

/** Desktop device binding — see 40-authentication.md (PKCE + device binding). */
export const devices = pgTable(
  'devices',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    appVersion: text('app_version'),
    /** Salted SHA-256 of hardware ids — never the raw fingerprint. */
    deviceFingerprint: text('device_fingerprint').notNull(),
    /** Device public key for refresh-token (DPoP-style) binding. */
    publicKey: text('public_key'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    fpUk: unique('devices_fingerprint_uk').on(t.deviceFingerprint),
    byUser: index('devices_user_idx').on(t.userId),
  }),
);
