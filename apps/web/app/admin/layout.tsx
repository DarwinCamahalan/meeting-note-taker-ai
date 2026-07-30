import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { resolveAdminAuth } from '@/lib/auth/session';
import { SIGN_IN_PATH } from '@/lib/auth/constants';
import { AdminShell } from '@/features/admin/components/admin-shell';
import { highestRole } from '@/features/admin/utils/roles';
import { Wordmark } from '@/features/marketing/wordmark';
import type { AdminBootstrap } from '@/features/admin/types';

export const metadata: Metadata = {
  title: 'Admin console',
  description: 'Manage your Cue organization: members, SSO, settings, and billing.',
  robots: { index: false, follow: false },
};

// Auth depends on request cookies — never statically render.
export const dynamic = 'force-dynamic';

/**
 * Server-side `/admin` guard. Resolves the session via @cue/sdk (`GET /v1/me`),
 * redirects unauthenticated visitors to the SSO sign-in entrypoint, shows a
 * forbidden screen for signed-in non-admins, and otherwise renders the console
 * shell seeded with the caller's identity + role.
 */
export default async function AdminLayout({ children }: { children: ReactNode }): Promise<React.JSX.Element> {
  const auth = await resolveAdminAuth();

  if (auth.status === 'unauthenticated') {
    redirect(`${SIGN_IN_PATH}?return=/admin`);
  }

  if (auth.status === 'forbidden') {
    return <ForbiddenScreen />;
  }

  const role = highestRole(auth.me.roles);
  if (!role) {
    // Defensive: `resolveAdminAuth` already asserted a privileged role.
    return <ForbiddenScreen />;
  }

  const bootstrap: AdminBootstrap = {
    user: auth.me.user,
    org: auth.me.org,
    role,
  };

  return <AdminShell bootstrap={bootstrap}>{children}</AdminShell>;
}

function ForbiddenScreen(): React.JSX.Element {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-8">
        <Wordmark />
      </div>
      <div className="surface-card max-w-md">
        <h1 className="text-xl font-semibold">Admin access required</h1>
        <p className="mt-2 text-sm text-white/60">
          Your account isn't an owner or admin of this organization. Ask an admin to grant you access.
        </p>
        <Link href="/" className="btn-secondary mt-6 !px-4 !py-2">
          Back to home
        </Link>
      </div>
    </div>
  );
}
