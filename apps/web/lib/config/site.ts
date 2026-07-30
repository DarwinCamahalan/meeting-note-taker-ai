/**
 * Static site constants + env-derived config. Secrets never live here; only
 * public URLs pulled from env with safe local-dev defaults.
 */

export const SITE = {
  name: 'Cue',
  /** Provisional brand — see docs/01-product-vision.md. */
  tagline: 'Your private AI copilot for live meetings and interviews.',
  description:
    'Cue is a content-protected desktop overlay that transcribes your call in real time and surfaces AI cues only you can see — for interviews, sales, support, and meeting notes.',
} as const;

/** Public site origin, used for canonical/OG URLs. */
export function siteUrl(): string {
  return process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000';
}

/** Cue `api` BFF base URL (device-code approval, /me, sessions). */
export function apiBaseUrl(): string {
  return process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:3001';
}
