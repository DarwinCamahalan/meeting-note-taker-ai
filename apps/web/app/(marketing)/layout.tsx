import { SiteFooter } from '@/features/marketing/site-footer';
import { SiteNav } from '@/features/marketing/site-nav';

/** Shared chrome for the marketing route group (nav + footer). */
export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
