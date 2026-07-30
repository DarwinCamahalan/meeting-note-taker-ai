/**
 * @cue/types/billing — subscription, entitlement, usage, and Stripe DTOs shared
 * by `api` (BillingModule / BillingWebhooksModule / EntitlementsModule /
 * UsageModule), the desktop app, the web pricing CTAs, and the typed SDK.
 *
 * These are transport-agnostic plain data (survive JSON + structured-clone).
 * The `entitlements` table is the runtime source of truth for feature gates
 * (50-subscriptions-entitlements.md §4); Stripe is the source of truth for
 * billing STATE. These DTOs are the contract between the two.
 */
import type { LiveModel, Plan } from './api.js';

/* ------------------------------------------------------------------ *
 * Plan tiers
 * ------------------------------------------------------------------ */

/**
 * Product plan tier. Aliases {@link Plan} so tier config and subscription DTOs
 * read intentionally; do NOT diverge the string set from `Plan`.
 */
export type PlanTier = Plan;

/** Billing cadence. Annual = 2 months free (enforced via distinct Stripe Prices). */
export type BillingInterval = 'month' | 'year';

/**
 * Static, code-owned description of a tier (50 §2). Templates live in
 * `@cue/core`; this DTO is what the web pricing page + SDK render against.
 * Prices are in whole USD (dollars), not cents, to keep the pricing UI simple.
 */
export interface PlanTierConfig {
  tier: PlanTier;
  displayName: string;
  /** Whole USD / month for the monthly Price; null for Free/Enterprise. */
  priceMonthlyUsd: number | null;
  /** Whole USD / year for the annual Price; null for Free/Enterprise. */
  priceYearlyUsd: number | null;
  /** Per-seat pricing (Team) vs. flat (Pro). */
  perSeat: boolean;
  /** Included live minutes per month (per seat when `perSeat`). */
  liveMinutesPerMonth: number | null;
  /** Claude models the tier may use on the live hot path. */
  liveModels: LiveModel[];
  /** Whether Opus deep-prep/analysis is included. */
  opusPrep: boolean;
  /** RAG document uploads permitted. */
  ragUploads: boolean;
  /** Metered overage beyond the allotment (Pro/Team+); Free hard-caps. */
  meteredOverage: boolean;
  /** The entitlement keys this tier enables (feature-gate matrix, 50 §3). */
  entitlementKeys: EntitlementKey[];
}

/* ------------------------------------------------------------------ *
 * Entitlements (feature gates) — 50 §3 feature-gate matrix
 * ------------------------------------------------------------------ */

/**
 * The stable entitlement-key contract between billing and app. Feature code
 * checks THESE keys, never tier names (50 §3). Additive: tolerate unknowns.
 */
export type EntitlementKey =
  | 'live.session'
  | 'live.minutes.quota'
  | 'live.minutes.overage'
  | 'live.concurrency'
  | 'model.haiku'
  | 'model.sonnet'
  | 'model.opus'
  | 'rag.upload'
  | 'rag.storage.bytes'
  | 'rag.shared_kb'
  | 'history.retention'
  | 'history.export'
  | 'session.disclosed_mode'
  | 'prompts.custom'
  | 'org.admin'
  | 'org.rbac'
  | 'auth.sso_lite'
  | 'auth.saml_scim'
  | 'org.audit_export'
  | 'stt.on_prem'
  | 'compliance.residency'
  | 'ai.priority'
  | 'sla.uptime';

/**
 * A resolved feature gate. Boolean gates set `enabled`; quota gates additionally
 * carry a numeric `limit` (and, on the usage-resolved snapshot, `remaining`).
 */
export interface Entitlement {
  key: EntitlementKey;
  /** True when the feature is available at all on the current plan. */
  enabled: boolean;
  /** Quota ceiling for numeric gates (e.g. monthly minutes, bytes); null = boolean-only or unlimited. */
  limit: number | null;
  /** Unit for the limit ('minutes' | 'bytes' | 'count' | ...); omitted for boolean gates. */
  unit?: string;
  /** Remaining quota this period after subtracting usage; null = unlimited/N/A. */
  remaining?: number | null;
}

/**
 * `GET /v1/me/entitlements` response — the denormalized snapshot the desktop
 * app and `ws-gateway` gate on. `version` matches the WS
 * `entitlements.updated` bump so clients know when to re-fetch.
 */
export interface EntitlementsResponse {
  orgId: string;
  tier: PlanTier;
  /** Monotonic snapshot version; bumped on webhook/usage-driven invalidation. */
  version: number;
  entitlements: Entitlement[];
}

/**
 * NestJS metadata key set by the `@RequireEntitlement(key)` decorator and read
 * by the entitlements guard via `Reflector`. Defined here so the decorator, the
 * guard, and any tests share one literal.
 */
export const REQUIRE_ENTITLEMENT_METADATA_KEY = 'cue:require-entitlement' as const;

/* ------------------------------------------------------------------ *
 * Subscriptions (Stripe billing state projection)
 * ------------------------------------------------------------------ */

/** Stripe subscription status set we reconcile against (subscriptions.status). */
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused';

/** API view of a `subscriptions` row (Stripe ids omitted from the wire surface). */
export interface Subscription {
  id: string;
  orgId: string;
  tier: PlanTier;
  status: SubscriptionStatus;
  seats: number;
  interval: BillingInterval;
  /** ISO-8601; end of the current paid period. */
  currentPeriodEnd: string;
  /** ISO-8601 when the subscription will end (set cancel-at-period-end); else null. */
  cancelAt: string | null;
  /** ISO-8601 trial end; null when not trialing. */
  trialEndsAt: string | null;
}

/* ------------------------------------------------------------------ *
 * Stripe Checkout + Customer Portal
 * ------------------------------------------------------------------ */

/** `POST /v1/billing/checkout` request — start a hosted Checkout session. */
export interface CheckoutSessionRequest {
  /** The paid tier to subscribe to. 'free'/'enterprise' are not self-serve. */
  tier: Exclude<PlanTier, 'free' | 'enterprise'>;
  interval: BillingInterval;
  /** Seat count for per-seat (Team) tiers; defaults to 1. */
  seats?: number;
  /** Absolute URL Stripe redirects to on success; server default when omitted. */
  successUrl?: string;
  /** Absolute URL Stripe redirects to on cancel; server default when omitted. */
  cancelUrl?: string;
}

/** `POST /v1/billing/checkout` response — the hosted Checkout URL to open. */
export interface CheckoutSessionResponse {
  /** Stripe-hosted Checkout URL the client redirects the browser to. */
  url: string;
  /** Stripe Checkout Session id (cs_...), for reconciliation/telemetry. */
  sessionId: string;
}

/** `POST /v1/billing/portal` response — a Stripe Customer Portal link. */
export interface PortalLinkResponse {
  /** Stripe-hosted Customer Portal URL. */
  url: string;
}

/* ------------------------------------------------------------------ *
 * Stripe webhooks (billing-webhooks module inside `api`)
 * ------------------------------------------------------------------ */

/**
 * The Stripe event types `BillingWebhooksModule` reconciles into subscriptions
 * + entitlements (51-payments-stripe.md). Additive: unlisted events are ack'd
 * and ignored.
 */
export type StripeWebhookEventType =
  | 'checkout.session.completed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'customer.subscription.trial_will_end'
  | 'customer.subscription.paused'
  | 'customer.subscription.resumed'
  | 'invoice.paid'
  | 'invoice.payment_succeeded'
  | 'invoice.payment_failed';

/* ------------------------------------------------------------------ *
 * Usage / metering — 50 §6
 * ------------------------------------------------------------------ */

/** Enforcement state for live-minute metering (soft-warn -> hard-cap/overage). */
export type UsageEnforcementState = 'ok' | 'soft_warn' | 'overage' | 'hard_capped';

/**
 * `GET /v1/billing/usage` response — the current billing period's live-minute
 * ledger, enforcement state, and overage economics. Drives the desktop meter
 * and the pre-session quota check.
 */
export interface UsageSummary {
  orgId: string;
  /** ISO-8601 current billing period bounds. */
  periodStart: string;
  periodEnd: string;
  /** Whole live minutes consumed this period. */
  liveMinutesUsed: number;
  /** Included allotment for the period (per plan, pooled across seats). */
  liveMinutesIncluded: number;
  /** max(included - used, 0). */
  liveMinutesRemaining: number;
  /** Minutes billed as metered overage beyond the allotment. */
  overageMinutes: number;
  /** Per-minute overage price in USD (locked: $0.13/min). */
  overageRateUsd: number;
  /** Whether this plan allows overage (Free hard-caps instead). */
  overageAllowed: boolean;
  state: UsageEnforcementState;
}
