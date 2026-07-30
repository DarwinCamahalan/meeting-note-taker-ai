/**
 * Billing / entitlements / usage. See 30-data-model.md §3.5.
 * This schema is the persisted projection the entitlements + payments services
 * read/write (feature-gate semantics + Stripe sync owned by those docs).
 */
import { index, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps, usageKindEnum } from './_shared.js';
import { orgs } from './identity.js';
import { sessions } from './sessions.js';

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: primaryId(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    stripeSubscriptionId: text('stripe_subscription_id').notNull(),
    stripePriceId: text('stripe_price_id').notNull(),
    /** 'pro' | 'team' | 'enterprise'. */
    tier: text('tier').notNull(),
    /** trialing | active | past_due | canceled | ... */
    status: text('status').notNull(),
    seats: numeric('seats').notNull().default('1'),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: timestamp('cancel_at_period_end', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    stripeUk: unique('subs_stripe_uk').on(t.stripeSubscriptionId),
    byOrg: index('subs_org_idx').on(t.orgId),
  }),
);

/** Denormalized, fast-to-read feature gates; read on every session start. */
export const entitlements = pgTable(
  'entitlements',
  {
    id: primaryId(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    /** 'live_minutes' | 'models' | 'rag_uploads' | 'history' | 'sso'. */
    feature: text('feature').notNull(),
    /** e.g. { monthlyMinutes: 60, models: ['haiku'] }. */
    limits: jsonb('limits').notNull(),
    ...timestamps,
  },
  (t) => ({
    orgFeatureUk: unique('entitlements_org_feature_uk').on(t.orgId, t.feature),
  }),
);

/** Append-only metering ledger, aggregated to Stripe usage records. */
export const usageEvents = pgTable(
  'usage_events',
  {
    id: primaryId(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    kind: usageKindEnum('kind').notNull(),
    quantity: numeric('quantity').notNull(),
    /** 'minutes' | 'seconds' | 'tokens' | 'queries'. */
    unit: text('unit').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    reportedToStripeAt: timestamp('reported_to_stripe_at', { withTimezone: true }),
  },
  (t) => ({
    byOrgTime: index('usage_org_time_idx').on(t.orgId, t.occurredAt),
    unreportedIdx: index('usage_unreported_idx').on(t.reportedToStripeAt),
  }),
);
