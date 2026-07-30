import Link from 'next/link';
import { SITE } from '@/lib/config/site';
import { NAV_LINKS } from './content';

/** Marketing footer (server component). */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-white/10 bg-ink-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-white/50">
          © {year} {SITE.name}. A private layer for your conversations.
        </p>
        <div className="flex flex-wrap gap-6 text-sm text-white/60">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-white">
              {link.label}
            </Link>
          ))}
          <Link href="/activate" className="transition hover:text-white">
            Activate a device
          </Link>
        </div>
      </div>
    </footer>
  );
}
