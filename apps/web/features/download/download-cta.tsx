'use client';

import { pickAsset } from '@/lib/release/normalize';
import { useLatestRelease } from './hooks/use-latest-release';
import { useOsDetect } from './hooks/use-os-detect';
import { assetSubLabel } from './utils/asset';

/**
 * Primary OS-aware download button. Renders a neutral "Download" until client
 * detection + the release feed resolve, then links straight to the signed CDN
 * asset URL for the detected platform (binaries never touch this origin).
 */
export function DownloadCta() {
  const platform = useOsDetect();
  const { data, isLoading, error } = useLatestRelease();

  const asset = data ? pickAsset(data, platform?.os ?? null, platform?.arch ?? null) : null;
  const label = platform ? `Download for ${platform.label}` : 'Download';
  const ready = Boolean(asset);

  return (
    <div className="flex flex-col items-center gap-3">
      {ready && asset ? (
        <a href={asset.url} className="btn-primary text-base" aria-busy={isLoading}>
          {label}
          {data && <span className="opacity-70">v{data.version}</span>}
        </a>
      ) : (
        <button type="button" className="btn-primary text-base" disabled aria-busy={isLoading}>
          {isLoading ? 'Finding your build…' : label}
        </button>
      )}

      {asset && (
        <p className="text-sm text-white/45">{assetSubLabel(asset)}</p>
      )}
      {error && (
        <p className="text-sm text-amber-300/80" role="status">
          Couldn&rsquo;t reach the release feed — pick a build below.
        </p>
      )}
    </div>
  );
}
