import type { AdminNavIcon } from '../types';

const PATHS: Record<AdminNavIcon, string> = {
  overview: 'M4 5h6v6H4zM14 5h6v4h-6zM14 13h6v6h-6zM4 15h6v4H4z',
  members:
    'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0M17 11a3 3 0 10-1-5.8M15.5 14.5A6 6 0 0121 20',
  sso: 'M12 15a3 3 0 100-6 3 3 0 000 6zM12 3v3M12 18v3M4.2 6.6l2.1 2.1M17.7 15.3l2.1 2.1M3 12h3M18 12h3',
  settings:
    'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1A1.7 1.7 0 004.6 19l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 13H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 5',
  billing: 'M3 7h18v10H3zM3 10h18M7 14h4',
};

/** Inline stroke glyph for a nav item. */
export function NavIcon({ icon }: { icon: AdminNavIcon }): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[icon]} />
    </svg>
  );
}
