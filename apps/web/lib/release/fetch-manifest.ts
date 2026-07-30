import type { ReleaseChannel, ReleaseManifest } from '@/lib/release/types';

/**
 * Server-side release-feed reader for `/api/latest-release`.
 *
 * Keep `RELEASE_REVALIDATE_SECONDS` in sync with the literal `revalidate` in
 * `app/api/latest-release/route.ts` (Next statically analyzes that export).
 */
export const RELEASE_REVALIDATE_SECONDS = 300;

/**
 * Bundled static fallback so the route never 500s when `RELEASES_URL` is unset
 * or unreachable (local dev, or a first deploy before a real release feed
 * exists). Empty `assets` keeps the download UI on its neutral state.
 */
function fallbackManifest(channel: ReleaseChannel): ReleaseManifest {
  return {
    version: '0.0.0-dev',
    channel,
    releasedAt: '1970-01-01T00:00:00.000Z',
    notesUrl:
      'https://github.com/DarwinCamahalan/meeting-note-taker-ai/releases',
    assets: [],
  };
}

/**
 * Fetch + normalize the release manifest for a channel from `RELEASES_URL`.
 * The feed may be a single manifest object or an array of per-channel
 * manifests. Any failure (missing env, non-2xx, parse error) falls back to the
 * bundled static manifest — this function never throws.
 */
export async function fetchManifest(
  channel: ReleaseChannel = 'stable',
): Promise<ReleaseManifest> {
  const url = process.env['RELEASES_URL'];
  if (!url) return fallbackManifest(channel);

  try {
    const res = await fetch(url, {
      next: { revalidate: RELEASE_REVALIDATE_SECONDS },
    });
    if (!res.ok) throw new Error(`release feed responded ${res.status}`);

    const payload = (await res.json()) as ReleaseManifest | ReleaseManifest[];
    const manifest = Array.isArray(payload)
      ? (payload.find((m) => m.channel === channel) ?? payload[0])
      : payload;

    return manifest ?? fallbackManifest(channel);
  } catch {
    return fallbackManifest(channel);
  }
}
