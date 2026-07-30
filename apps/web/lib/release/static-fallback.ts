import type { ReleaseManifest } from './types';

/**
 * Static fallback manifest served when `RELEASES_URL` is unset (local dev) or
 * the remote feed is unreachable. Points at placeholder CDN paths so the
 * download UI renders and links resolve; CI overwrites the real feed in prod.
 *
 * TODO(devops): replace placeholder `cdn.usecue.app` URLs + hashes with the
 * real signed R2/CloudFront artifacts (see `docs/60-devops-infrastructure.md`).
 * The `signature` is empty here because local dev has no signed feed; the
 * release pipeline emits `latest*.yml.minisig` and the prod feed carries it.
 */
export const STATIC_FALLBACK_MANIFEST: ReleaseManifest = {
  version: '0.1.0',
  channel: 'stable',
  releasedAt: '2026-07-30T00:00:00.000Z',
  notesUrl: 'https://github.com/cue-app/cue/releases',
  signature: '',
  signatureUrl: 'https://cdn.usecue.app/releases/stable/latest.yml.minisig',
  assets: [
    {
      os: 'mac',
      arch: 'universal',
      ext: 'dmg',
      url: 'https://cdn.usecue.app/releases/stable/Cue-0.1.0-universal.dmg',
      size: 118_000_000,
      sha512: '',
    },
    {
      os: 'windows',
      arch: 'x64',
      ext: 'exe',
      url: 'https://cdn.usecue.app/releases/stable/Cue-Setup-0.1.0-x64.exe',
      size: 96_000_000,
      sha512: '',
    },
    {
      os: 'linux',
      arch: 'x64',
      ext: 'AppImage',
      url: 'https://cdn.usecue.app/releases/stable/Cue-0.1.0-x86_64.AppImage',
      size: 104_000_000,
      sha512: '',
    },
  ],
};
