import type { AdminNavItem } from '../types';

/** Left-nav structure for the admin console. Order is display order. */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: '/admin', label: 'Overview', icon: 'overview' },
  { href: '/admin/members', label: 'Members', icon: 'members' },
  { href: '/admin/sso', label: 'SSO', icon: 'sso', gated: true },
  { href: '/admin/settings', label: 'Settings', icon: 'settings' },
  { href: '/admin/billing', label: 'Seats & billing', icon: 'billing' },
];
