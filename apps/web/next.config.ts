import type { NextConfig } from 'next';

/**
 * Cue web (marketing + download) Next.js config.
 *
 * Security headers mirror `docs/11-web-landing.md §9`. Installer binaries are
 * never served here — `/api/latest-release` returns only URLs (see the route
 * handler). Phase 2 adds the R3F hero + `optimizePackageImports`; kept lean now.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
