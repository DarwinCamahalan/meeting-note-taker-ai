import { NextResponse } from 'next/server';
import { fetchManifest } from '@/lib/release/fetch-manifest';

/**
 * GET /api/latest-release — normalized release manifest for the download UI and
 * (in prod) the desktop auto-updater. Reads the canonical feed from `RELEASES_URL`
 * via `fetchManifest`, which falls back to a bundled static manifest so this
 * never 500s. ISR-cached (5 min) per docs/11-web-landing.md §6.2.
 *
 * NOTE: Next statically analyzes `revalidate`, so it must be a literal — keep it
 * in sync with RELEASE_REVALIDATE_SECONDS in lib/release/fetch-manifest.ts.
 */
export const revalidate = 300;

export async function GET(): Promise<NextResponse> {
  const manifest = await fetchManifest('stable');
  return NextResponse.json(manifest, {
    headers: {
      // Browser: short. CDN: 5 min + SWR so a new release surfaces fast.
      'Cache-Control':
        'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
    },
  });
}
