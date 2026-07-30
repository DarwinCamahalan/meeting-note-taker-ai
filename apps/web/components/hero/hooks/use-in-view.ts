'use client';

import { useEffect, useState, type RefObject } from 'react';

export interface UseInViewOptions {
  /** Expand the observer's bounds so the scene mounts just before it scrolls in. */
  rootMargin?: string;
  /** Visible ratio that flips the element to "in view". */
  threshold?: number;
}

/**
 * Reports whether `ref` is near the viewport AND the tab is visible.
 *
 * Two independent signals gate the hero's render loop (docs/11-web-landing.md
 * §4.2): an `IntersectionObserver` (scrolled into view) and
 * `document.visibilitychange` (tab foregrounded). The scene mounts only when
 * near the viewport and pauses its GPU work whenever either signal is false,
 * so a backgrounded tab or scrolled-away hero never burns battery.
 */
export function useInView(
  ref: RefObject<Element | null>,
  { rootMargin = '200px', threshold = 0 }: UseInViewOptions = {},
): boolean {
  const [intersecting, setIntersecting] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setIntersecting(entry.isIntersecting);
      },
      { rootMargin, threshold },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref, rootMargin, threshold]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const onVisibility = (): void => {
      setDocumentVisible(document.visibilityState === 'visible');
    };

    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return intersecting && documentVisible;
}
