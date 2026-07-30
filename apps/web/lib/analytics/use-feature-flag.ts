'use client';

/**
 * `useFeatureFlag` — read a PostHog feature flag as a boolean, with a typed key
 * and an explicit fallback used before flags load or when analytics is disabled
 * (no browser key). This keeps flag-gated UI deterministic in SSR/preview and
 * avoids a flash when the flag resolves.
 *
 *   const show3d = useFeatureFlag(FEATURE_FLAGS.hero3d, true);
 */
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { analyticsEnabled, type FeatureFlag } from './posthog';

/**
 * @param flag      one of {@link FEATURE_FLAGS}
 * @param fallback  value returned until the flag resolves / when disabled
 */
export function useFeatureFlag(flag: FeatureFlag, fallback = false): boolean {
  // Hook must be called unconditionally (rules of hooks); the result is only
  // meaningful once PostHog is loaded.
  const enabled = useFeatureFlagEnabled(flag);
  if (!analyticsEnabled || enabled === undefined) return fallback;
  return enabled;
}
