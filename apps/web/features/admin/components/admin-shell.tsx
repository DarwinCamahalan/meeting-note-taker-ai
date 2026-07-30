'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { clearClientTokens } from '@/lib/auth/client-session';
import { Wordmark } from '@/features/marketing/wordmark';
import { AdminContextProvider } from '../context';
import type { AdminBootstrap } from '../types';
import { roleLabel } from '../utils/roles';
import { initials } from '../utils/format';
import { ADMIN_NAV } from './nav-items';
import { NavIcon } from './nav-icon';
import { RoleBadge } from './role-badge';

/**
 * The admin console chrome: brand + org switcher header, left nav, and the
 * signed-in identity with sign-out. Server-rendered layout wraps its page
 * children with this after the role guard passes, seeding {@link AdminContextProvider}.
 */
export function AdminShell({
  bootstrap,
  children,
}: {
  bootstrap: AdminBootstrap;
  children: ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = (): void => {
    clearClientTokens();
    router.push('/');
    router.refresh();
  };

  return (
    <AdminContextProvider bootstrap={bootstrap}>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
            <div className="flex items-center gap-3">
              <Link href="/" aria-label="Cue home">
                <Wordmark />
              </Link>
              <span className="text-white/25">/</span>
              <span className="text-sm font-medium text-white/80">{bootstrap.org.name}</span>
              <RoleBadge role={bootstrap.role} />
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm text-white/80">{bootstrap.user.displayName ?? bootstrap.user.email}</p>
                <p className="text-xs text-white/40">{roleLabel(bootstrap.role)}</p>
              </div>
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-full bg-cue-500/20 text-xs font-semibold text-cue-100"
              >
                {initials(bootstrap.user.displayName, bootstrap.user.email)}
              </span>
              <button type="button" onClick={signOut} className="btn-secondary !px-4 !py-2">
                Sign out
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-6 py-8">
          <nav aria-label="Admin sections" className="hidden w-52 shrink-0 md:block">
            <ul className="space-y-1">
              {ADMIN_NAV.map((item) => {
                const active =
                  item.href === '/admin'
                    ? pathname === '/admin'
                    : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                        active
                          ? 'bg-cue-500/15 text-white'
                          : 'text-white/60 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <NavIcon icon={item.icon} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <main className="min-w-0 flex-1 space-y-6">{children}</main>
        </div>
      </div>
    </AdminContextProvider>
  );
}
