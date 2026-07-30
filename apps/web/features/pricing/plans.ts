import type { PricingTier } from './types';

/**
 * Canonical pricing tiers, mirroring `docs/50-subscriptions-entitlements.md §2`.
 * Display only — Stripe Checkout happens in-app, not on the marketing site.
 * Prices: Free $0 · Pro $20/mo ($200/yr) · Team $30/seat/mo ($300/seat/yr).
 */
export const PRICING_TIERS: readonly PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    monthly: 0,
    annual: 0,
    perSeat: false,
    tagline: 'Try AssistMe on real calls.',
    features: [
      '60 live minutes / month',
      'Haiku live cues (claude-haiku-4-5)',
      '7-day session history',
      '1 concurrent live session',
      'Disclosed / consent mode',
    ],
    cta: { label: 'Download free', href: '/download' },
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 20,
    annual: 200,
    perSeat: false,
    tagline: 'For daily interviews & calls.',
    features: [
      '1,200 live minutes / month + overage',
      'Haiku + Sonnet real-time answers',
      'RAG uploads — 50 docs / 200 MB',
      'Unlimited history + export',
      '2 concurrent sessions',
    ],
    cta: { label: 'Start 14-day trial', href: '/download' },
    featured: true,
  },
  {
    id: 'team',
    name: 'Team',
    monthly: 30,
    annual: 300,
    perSeat: true,
    tagline: 'Shared knowledge & admin.',
    features: [
      '1,500 pooled minutes / seat',
      'Haiku + Sonnet + Opus for prep',
      'Shared knowledge base — 500 docs / 2 GB / seat',
      'Admin console, roles, SSO-lite',
      'Priority AI queue',
    ],
    cta: { label: 'Start with your team', href: '/download' },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthly: null,
    annual: null,
    perSeat: false,
    tagline: 'Compliance, SSO & SLA.',
    features: [
      'Custom pooled minutes, SLA-backed',
      'All models + dedicated capacity option',
      'SSO / SAML / SCIM + audit export',
      'Data residency (EU) & DPA',
      'Dedicated CSM',
    ],
    cta: { label: 'Contact sales', href: 'mailto:sales@usecue.app' },
  },
];
