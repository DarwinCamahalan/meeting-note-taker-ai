'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { HeroPoster } from './hero-poster';
import { useInView } from './hooks/use-in-view';
import { useReducedMotion } from './hooks/use-reduced-motion';

/**
 * `three` + `@react-three/*` live ONLY inside `./scene`, loaded via a client
 * `next/dynamic` with `ssr: false`. In the Next 15 App Router `ssr: false` may
 * only be passed to `dynamic` from a Client Component — hence the `'use client'`
 * here — and it keeps the WebGL bundle out of both the RSC payload and the
 * initial route JS (docs/11-web-landing.md §4.1).
 */
const Scene = dynamic(() => import('./scene').then((m) => m.Scene), {
  ssr: false,
  loading: () => <HeroPoster reason="loading" />,
});

/** Feature-detect WebGL so clients without it get the poster, never a blank canvas. */
function detectWebGl(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')),
    );
  } catch {
    return false;
  }
}

/**
 * Landing hero visual. Renders the static {@link HeroPoster} until it is safe
 * and worthwhile to mount the WebGL scene — i.e. motion is allowed, WebGL is
 * available, and the hero is near the viewport with the tab focused. The scene
 * pauses (idling the GPU) the moment it scrolls away or the tab is hidden.
 * Decorative throughout: the real H1/value-prop copy lives beside it in the DOM.
 */
export function Hero3D(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const inView = useInView(ref, { rootMargin: '200px' });

  const [webglReady, setWebglReady] = useState(false);
  useEffect(() => {
    setWebglReady(detectWebGl());
  }, []);

  const showScene = webglReady && !reducedMotion && inView;

  return (
    <div ref={ref} className="relative mx-auto aspect-[16/10] w-full max-w-md">
      {showScene ? (
        <Scene paused={!inView} />
      ) : (
        <HeroPoster reason={reducedMotion ? 'reduced-motion' : webglReady ? 'offscreen' : 'no-webgl'} />
      )}
    </div>
  );
}
