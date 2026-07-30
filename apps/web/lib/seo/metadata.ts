import type { Metadata } from 'next';
import { SITE, siteUrl } from '../config/site';

/**
 * Per-route metadata builder (canonical + OpenGraph + Twitter). Mirrors
 * `docs/11-web-landing.md §7`; OG image generation is a Phase 2 add.
 */
export function buildMetadata(p: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = `${siteUrl()}${p.path}`;
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: url },
    openGraph: {
      title: p.title,
      description: p.description,
      url,
      siteName: SITE.name,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: p.title,
      description: p.description,
    },
  };
}
