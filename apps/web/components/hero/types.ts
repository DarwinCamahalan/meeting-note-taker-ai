/**
 * Shared types for the R3F landing hero (`components/hero/*`). Kept dependency
 * free so they can be imported from both the server-safe wrapper and the
 * code-split, `three`-importing scene chunk without pulling WebGL into the RSC
 * graph.
 */

/**
 * Why the static poster is showing instead of the live WebGL scene. Purely for
 * diagnostics / analytics — the poster looks identical in every case.
 */
export type HeroPosterReason = 'loading' | 'reduced-motion' | 'offscreen' | 'no-webgl';

export interface HeroPosterProps {
  reason: HeroPosterReason;
}

export interface SceneProps {
  /**
   * When true, the render loop idles (`frameloop="never"` + Float speed 0) so a
   * scrolled-away or backgrounded hero costs no GPU (docs/11-web-landing.md §4.2).
   */
  paused: boolean;
}
