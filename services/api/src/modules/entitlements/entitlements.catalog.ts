/**
 * Code-owned entitlement templates — the canonical `tier -> feature-gate`
 * matrix from 50-subscriptions-entitlements.md §2/§3. Billing state (Stripe)
 * maps to a {@link PlanTier}; this table turns that tier into the resolved
 * {@link Entitlement} list persisted into the `entitlements` table (the runtime
 * source of truth) and returned by `GET /v1/me/entitlements`.
 *
 * Feature code checks entitlement KEYS, never tier names (50 §3). Keeping the
 * matrix here (pure data, no Nest deps) keeps it unit-testable and driftless.
 *
 * TODO(phase-3): promote this catalog to `@cue/core` so `ws-gateway` resolves
 * the identical templates without importing the api.
 */
import type { Entitlement, EntitlementKey, PlanTier } from '@cue/types';

/** Bytes helpers so the storage quotas read as their doc-stated MB/GB values. */
const MB = 1_024 * 1_024;
const GB = 1_024 * MB;

/**
 * A single gate spec in a tier template. `limit`/`unit` are omitted for pure
 * boolean gates; `null` limit means "enabled but unlimited/uncapped".
 */
interface GateSpec {
  enabled: boolean;
  limit?: number | null;
  unit?: string;
}

/** Every entitlement key a tier template must answer for, in stable order. */
const ENTITLEMENT_KEYS: readonly EntitlementKey[] = [
  'live.session',
  'live.minutes.quota',
  'live.minutes.overage',
  'live.concurrency',
  'model.haiku',
  'model.sonnet',
  'model.opus',
  'rag.upload',
  'rag.storage.bytes',
  'rag.shared_kb',
  'history.retention',
  'history.export',
  'session.disclosed_mode',
  'prompts.custom',
  'org.admin',
  'org.rbac',
  'auth.sso_lite',
  'auth.saml_scim',
  'org.audit_export',
  'stt.on_prem',
  'compliance.residency',
  'ai.priority',
  'sla.uptime',
];

type TierTemplate = Partial<Record<EntitlementKey, GateSpec>>;

const OFF: GateSpec = { enabled: false };

/**
 * Per-tier overrides. Any key absent from a template defaults to {@link OFF}
 * (disabled boolean gate). This keeps each template to only what it enables.
 */
const TIER_TEMPLATES: Record<PlanTier, TierTemplate> = {
  free: {
    'live.session': { enabled: true },
    'live.minutes.quota': { enabled: true, limit: 60, unit: 'minutes' },
    'live.minutes.overage': OFF,
    'live.concurrency': { enabled: true, limit: 1, unit: 'count' },
    'model.haiku': { enabled: true },
    'rag.storage.bytes': { enabled: false, limit: 0, unit: 'bytes' },
    'history.retention': { enabled: true, limit: 7, unit: 'days' },
    'session.disclosed_mode': { enabled: true },
    'prompts.custom': { enabled: true, limit: 1, unit: 'count' },
  },
  pro: {
    'live.session': { enabled: true },
    'live.minutes.quota': { enabled: true, limit: 1_200, unit: 'minutes' },
    'live.minutes.overage': { enabled: true },
    'live.concurrency': { enabled: true, limit: 2, unit: 'count' },
    'model.haiku': { enabled: true },
    'model.sonnet': { enabled: true },
    'rag.upload': { enabled: true },
    'rag.storage.bytes': { enabled: true, limit: 200 * MB, unit: 'bytes' },
    'history.retention': { enabled: true, limit: null, unit: 'days' },
    'history.export': { enabled: true },
    'session.disclosed_mode': { enabled: true },
    'prompts.custom': { enabled: true, limit: 10, unit: 'count' },
  },
  team: {
    'live.session': { enabled: true },
    'live.minutes.quota': { enabled: true, limit: 1_500, unit: 'minutes' },
    'live.minutes.overage': { enabled: true },
    'live.concurrency': { enabled: true, limit: 3, unit: 'count' },
    'model.haiku': { enabled: true },
    'model.sonnet': { enabled: true },
    'model.opus': { enabled: true },
    'rag.upload': { enabled: true },
    'rag.storage.bytes': { enabled: true, limit: 2 * GB, unit: 'bytes' },
    'rag.shared_kb': { enabled: true },
    'history.retention': { enabled: true, limit: null, unit: 'days' },
    'history.export': { enabled: true },
    'session.disclosed_mode': { enabled: true },
    'prompts.custom': { enabled: true, limit: null, unit: 'count' },
    'org.admin': { enabled: true },
    'org.rbac': { enabled: true },
    'auth.sso_lite': { enabled: true },
    'ai.priority': { enabled: true },
  },
  enterprise: {
    'live.session': { enabled: true },
    'live.minutes.quota': { enabled: true, limit: null, unit: 'minutes' },
    'live.minutes.overage': { enabled: true },
    'live.concurrency': { enabled: true, limit: null, unit: 'count' },
    'model.haiku': { enabled: true },
    'model.sonnet': { enabled: true },
    'model.opus': { enabled: true },
    'rag.upload': { enabled: true },
    'rag.storage.bytes': { enabled: true, limit: null, unit: 'bytes' },
    'rag.shared_kb': { enabled: true },
    'history.retention': { enabled: true, limit: null, unit: 'days' },
    'history.export': { enabled: true },
    'session.disclosed_mode': { enabled: true },
    'prompts.custom': { enabled: true, limit: null, unit: 'count' },
    'org.admin': { enabled: true },
    'org.rbac': { enabled: true },
    'auth.sso_lite': { enabled: true },
    'auth.saml_scim': { enabled: true },
    'org.audit_export': { enabled: true },
    'stt.on_prem': { enabled: true },
    'compliance.residency': { enabled: true },
    'ai.priority': { enabled: true },
    'sla.uptime': { enabled: true },
  },
};

/** The included live-minute allotment for a tier (per-seat for Team); null = unlimited. */
export function liveMinutesLimit(tier: PlanTier): number | null {
  const spec = TIER_TEMPLATES[tier]['live.minutes.quota'];
  return spec?.limit ?? null;
}

/** Whether a tier permits metered overage past its allotment (Free hard-caps). */
export function overageAllowed(tier: PlanTier): boolean {
  return TIER_TEMPLATES[tier]['live.minutes.overage']?.enabled ?? false;
}

/**
 * Resolve the full, ordered {@link Entitlement} list for a tier. Boolean gates
 * carry `enabled` + `limit: null`; quota gates additionally carry `limit`+`unit`.
 * `remaining` is intentionally NOT set here — it is overlaid at read time from
 * live usage counters (see EntitlementsService.resolve).
 */
export function buildEntitlements(tier: PlanTier): Entitlement[] {
  const template = TIER_TEMPLATES[tier];
  return ENTITLEMENT_KEYS.map((key) => {
    const spec = template[key] ?? OFF;
    const entitlement: Entitlement = {
      key,
      enabled: spec.enabled,
      limit: spec.limit ?? null,
    };
    if (spec.unit !== undefined) {
      entitlement.unit = spec.unit;
    }
    return entitlement;
  });
}
