import type { Metadata } from 'next';
import { DownloadCta } from '@/features/download/download-cta';
import { DownloadGrid } from '@/features/download/download-grid';
import { SiteFooter } from '@/features/marketing/site-footer';
import { SiteNav } from '@/features/marketing/site-nav';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildMetadata({
  title: 'Download',
  description:
    'Download AssistMe for macOS, Windows, or Linux. We detect your platform and hand you the right signed installer.',
  path: '/download',
});

/** OS-aware download hub. Detection + feed fetch happen in client islands. */
export default function DownloadPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Download AssistMe
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/60">
            One click for your platform. AssistMe installs as a content-protected
            overlay — invisible to screen shares and recordings.
          </p>

          <div className="mt-10">
            <DownloadCta />
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 pb-24">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40">
            All platforms
          </h2>
          <div className="mt-6">
            <DownloadGrid />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
