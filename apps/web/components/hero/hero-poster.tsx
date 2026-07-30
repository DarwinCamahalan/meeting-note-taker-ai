import { OverlayMock } from '@/features/marketing/overlay-mock';
import type { HeroPosterProps } from './types';

/**
 * Static, dependency-free stand-in for the WebGL hero. Serves as:
 *  - the `loading` state while the `three` chunk streams in,
 *  - the permanent fallback for reduced-motion / offscreen / no-WebGL clients.
 *
 * It reuses the CSS/SVG {@link OverlayMock} so the poster and the live scene
 * tell the same "private overlay over a blurred meeting" story, and so the LCP
 * element is always cheap HTML — never a WebGL frame (docs/11-web-landing.md §4.3).
 * `aria-hidden` because the real headline + value prop live in the DOM beside it.
 */
export function HeroPoster({ reason }: HeroPosterProps): React.JSX.Element {
  return (
    <div
      aria-hidden
      data-hero-poster={reason}
      className="absolute inset-0 flex items-center justify-center"
    >
      <OverlayMock />
    </div>
  );
}
