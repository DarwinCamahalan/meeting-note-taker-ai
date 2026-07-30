'use client';

/**
 * Client-side analytics provider. Initializes PostHog once (browser only) with
 * the PII-safe options, then exposes it via the react context so components and
 * the `useFeatureFlag` hook can read flags / capture typed events. When no
 * browser key is configured the provider is a transparent pass-through, so the
 * site renders identically in dev/preview without analytics.
 */
import { useEffect } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { POSTHOG_KEY, POSTHOG_OPTIONS, analyticsEnabled } from '@/lib/analytics/posthog';

let initialized = false;

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!analyticsEnabled || !POSTHOG_KEY || initialized) return;
    posthog.init(POSTHOG_KEY, POSTHOG_OPTIONS);
    initialized = true;
  }, []);

  if (!analyticsEnabled) return <>{children}</>;
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
