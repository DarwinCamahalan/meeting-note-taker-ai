import Link from 'next/link';
import { SITE } from '@/lib/config/site';
import { NAV_LINKS } from './content';
import { Wordmark } from './wordmark';

/** Top marketing nav (server component). */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/80 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2" aria-label={`${SITE.name} home`}>
          <Wordmark />
        </Link>

        <div className="hidden items-center gap-8 text-sm text-white/70 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-white">
              {link.label}
            </Link>
          ))}
        </div>

        <Link href="/download" className="btn-primary !px-4 !py-2">
          Get Cue
        </Link>
      </nav>
    </header>
  );
}
