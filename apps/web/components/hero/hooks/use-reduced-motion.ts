'use client';

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Tracks the user's `prefers-reduced-motion` setting, subscribing to changes.
 *
 * Returns `true` when the OS requests reduced motion. Starts optimistic
 * (`false`) so the server render and first paint agree; the effect corrects it
 * on mount and on every subsequent media-query change. When `true`, the hero
 * renders the poster only — the WebGL scene chunk is never fetched
 * (docs/11-web-landing.md §4.3).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mql = window.matchMedia(QUERY);
    setReduced(mql.matches);

    const onChange = (event: MediaQueryListEvent): void => {
      setReduced(event.matches);
    };

    mql.addEventListener('change', onChange);
    return () => {
      mql.removeEventListener('change', onChange);
    };
  }, []);

  return reduced;
}
