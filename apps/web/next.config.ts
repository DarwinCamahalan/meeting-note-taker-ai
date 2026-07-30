import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

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
  // Compile the workspace TypeScript packages the web imports from source
  // (not prebuilt) so Vercel/Next build them without a separate prebuild step.
  transpilePackages: ['@cue/types', '@cue/sdk'],
  // Tree-shake drei's helper barrel so only the primitives the hero uses ship
  // in the lazy 3D chunk (docs/11-web-landing.md §4.4).
  experimental: {
    optimizePackageImports: ['@react-three/drei'],
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

/**
 * Wrap with the Sentry build plugin (source-map upload + tunnel route). It is
 * inert at build time unless SENTRY_* build env is present, and never changes
 * runtime behavior when no DSN is configured. Auth token / org / project are
 * read from env by the plugin (SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT).
 */
const sentryOrg = process.env['SENTRY_ORG'];
const sentryProject = process.env['SENTRY_PROJECT'];

export default withSentryConfig(nextConfig, {
  silent: !process.env['CI'],
  ...(sentryOrg ? { org: sentryOrg } : {}),
  ...(sentryProject ? { project: sentryProject } : {}),
  // Route browser telemetry through the app origin to survive ad-blockers.
  tunnelRoute: '/monitoring',
  // Do not fail the build when the (optional) auth token is absent.
  widenClientFileUpload: true,
});
