/**
 * PostHog product-analytics config for @cue/web (browser). Autocapture and
 * session recording are OFF by design — Cue never captures form values,
 * keystrokes, or DOM text that could carry PII (61-observability §product-
 * analytics). Only explicit, typed events from {@link ANALYTICS_EVENTS} are
 * emitted, and feature flags are read through {@link FEATURE_FLAGS}.
 */
import type { PostHogConfig } from 'posthog-js';

/** Public browser env — only `NEXT_PUBLIC_*` is available client-side. */
export const POSTHOG_KEY = process.env['NEXT_PUBLIC_POSTHOG_KEY'];
export const POSTHOG_HOST =
  process.env['NEXT_PUBLIC_POSTHOG_HOST'] ?? 'https://eu.i.posthog.com';

/** True when a browser key is configured; otherwise analytics is inert. */
export const analyticsEnabled = Boolean(POSTHOG_KEY);

/**
 * PII-safe init options. Autocapture, DOM text collection, and session
 * recording are disabled; the IP is not stored server-side.
 */
export const POSTHOG_OPTIONS: Partial<PostHogConfig> = {
  api_host: POSTHOG_HOST,
  autocapture: false,
  capture_pageview: true,
  capture_pageleave: true,
  disable_session_recording: true,
  // Never persist raw text/IP with events.
  mask_all_text: true,
  mask_all_element_attributes: true,
  ip: false,
  persistence: 'localStorage+cookie',
};

/** The typed, non-PII event allowlist the marketing site emits. */
export const ANALYTICS_EVENTS = {
  downloadClicked: 'download_clicked',
  pricingViewed: 'pricing_viewed',
  signinStarted: 'signin_started',
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** Known feature-flag keys (keeps `useFeatureFlag` calls type-checked). */
export const FEATURE_FLAGS = {
  hero3d: 'web-hero-3d',
  pricingAnnualToggle: 'web-pricing-annual-toggle',
} as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];
