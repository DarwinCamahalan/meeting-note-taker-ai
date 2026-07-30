/** Presentational helpers for release assets (pure). */
import type { ReleaseArch, ReleaseAsset, ReleaseOs } from '@/lib/release/types';

const OS_NAMES: Record<ReleaseOs, string> = {
  mac: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
};

const ARCH_NAMES: Record<ReleaseArch, string> = {
  arm64: 'Apple Silicon',
  x64: 'Intel / x64',
  universal: 'Universal',
};

export function osName(os: ReleaseOs): string {
  return OS_NAMES[os];
}

export function assetLabel(asset: ReleaseAsset): string {
  return `${OS_NAMES[asset.os]} · ${ARCH_NAMES[asset.arch]}`;
}

export function assetSubLabel(asset: ReleaseAsset): string {
  return `.${asset.ext} · ${formatBytes(asset.size)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—';
  const mb = bytes / 1_000_000;
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}
