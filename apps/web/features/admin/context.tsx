'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AdminBootstrap, AdminContextValue } from './types';

const AdminContext = createContext<AdminContextValue | null>(null);

/**
 * Provides the server-resolved identity/org/role to the client panels. Seeded
 * once by the admin layout from `resolveAdminAuth()`; panels read `orgId` +
 * `role` from here instead of re-fetching `/v1/me`.
 */
export function AdminContextProvider({
  bootstrap,
  children,
}: {
  bootstrap: AdminBootstrap;
  children: ReactNode;
}): React.JSX.Element {
  const value = useMemo<AdminContextValue>(
    () => ({ ...bootstrap, orgId: bootstrap.org.id }),
    [bootstrap],
  );
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

/** Read the admin context. Throws if used outside the provider (a wiring bug). */
export function useAdminContext(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) {
    throw new Error('useAdminContext must be used within <AdminContextProvider>.');
  }
  return value;
}
