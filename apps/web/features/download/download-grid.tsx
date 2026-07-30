'use client';

import { useLatestRelease } from './hooks/use-latest-release';
import { assetLabel, assetSubLabel } from './utils/asset';

/** All-platforms grid: every asset in the current release manifest. */
export function DownloadGrid() {
  const { data, isLoading, error } = useLatestRelease();

  if (isLoading) {
    return <p className="text-sm text-white/40">Loading available builds…</p>;
  }
  if (error || !data || data.assets.length === 0) {
    return (
      <p className="text-sm text-white/50" role="status">
        Release feed is temporarily unavailable. Please try again shortly.
      </p>
    );
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.assets.map((asset) => (
          <a
            key={`${asset.os}-${asset.arch}-${asset.ext}`}
            href={asset.url}
            className="surface-card flex items-center justify-between gap-4 transition hover:border-cue-500/50 hover:bg-ink-800/70"
          >
            <span>
              <span className="block text-sm font-semibold">{assetLabel(asset)}</span>
              <span className="block text-xs text-white/45">{assetSubLabel(asset)}</span>
            </span>
            <DownloadGlyph />
          </a>
        ))}
      </div>
      <p className="mt-4 text-xs text-white/35">
        AssistMe {data.version} · released {new Date(data.releasedAt).toLocaleDateString()}
      </p>
    </div>
  );
}

function DownloadGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0 text-cue-300"
      aria-hidden
    >
      <path
        d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
