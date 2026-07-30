import type {
  ReleaseArch,
  ReleaseAsset,
  ReleaseManifest,
  ReleaseOs,
} from '@/lib/release/types';

/**
 * Pick the best-matching installer asset for the detected platform.
 *
 * `os` / `arch` come from client-side detection and may be `'unknown'` or
 * `null`. Returns `null` when the OS is unknown or nothing matches, so the
 * download button falls back to its neutral state (see `DownloadCta`).
 * Preference: exact arch match → a `universal` build → the first asset for the OS.
 */
export function pickAsset(
  manifest: ReleaseManifest,
  os: string | null,
  arch: string | null,
): ReleaseAsset | null {
  if (!os || os === 'unknown') return null;

  const forOs = manifest.assets.filter((a) => a.os === (os as ReleaseOs));
  if (forOs.length === 0) return null;

  if (arch && arch !== 'unknown') {
    const exact = forOs.find((a) => a.arch === (arch as ReleaseArch));
    if (exact) return exact;
  }

  return forOs.find((a) => a.arch === 'universal') ?? forOs[0] ?? null;
}
