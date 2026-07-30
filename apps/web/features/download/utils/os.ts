/**
 * OS/arch detection helpers (pure). UA-string parsing is the fallback path;
 * the hook prefers `navigator.userAgentData`. Per docs/11-web-landing.md §6.1.
 */
import type { ReleaseArch, ReleaseOs } from '@/lib/release/types';

export type DetectedOs = ReleaseOs | 'unknown';
export type DetectedArch = Exclude<ReleaseArch, 'universal'> | 'unknown';

export interface DetectedPlatform {
  os: DetectedOs;
  arch: DetectedArch;
  /** Human label, e.g. "macOS". */
  label: string;
}

export const OS_LABELS: Record<DetectedOs, string> = {
  mac: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  unknown: 'your platform',
};

export function osFromUAString(ua: string): DetectedOs {
  if (/mac os x|macintosh/i.test(ua)) return 'mac';
  if (/windows nt/i.test(ua)) return 'windows';
  if (/linux|x11/i.test(ua) && !/android/i.test(ua)) return 'linux';
  return 'unknown';
}

export function archFromUAString(ua: string): DetectedArch {
  if (/arm64|aarch64/i.test(ua)) return 'arm64';
  if (/x86_64|win64|x64|wow64/i.test(ua)) return 'x64';
  // Apple Silicon Safari reports Intel → resolved via the universal .dmg.
  return 'unknown';
}

export function labelFor(os: DetectedOs): string {
  return OS_LABELS[os];
}
