import type { FC, SVGProps } from 'react';
import type { DashboardPage } from './use-dashboard';
import { HomeIcon, InfoIcon, KeyboardIcon, SettingsIcon } from './icons';

interface NavItem {
  id: DashboardPage;
  label: string;
  Icon: FC<SVGProps<SVGSVGElement>>;
}

const NAV: readonly NavItem[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
  { id: 'shortcuts', label: 'Shortcuts', Icon: KeyboardIcon },
  { id: 'about', label: 'About', Icon: InfoIcon },
];

interface SidebarProps {
  active: DashboardPage;
  onNavigate(page: DashboardPage): void;
  version?: string | undefined;
}

export function Sidebar({ active, onNavigate, version }: SidebarProps): React.JSX.Element {
  return (
    <nav className="side">
      <div className="side__brand">
        <span className="side__logo" aria-hidden="true">
          A
        </span>
        <span className="side__name">AssistMe</span>
      </div>

      <ul className="side__nav">
        {NAV.map(({ id, label, Icon }) => (
          <li key={id}>
            <button
              type="button"
              className={`side__item${active === id ? ' side__item--active' : ''}`}
              onClick={() => onNavigate(id)}
            >
              <Icon className="side__icon" />
              <span>{label}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="side__foot">
        <span className="side__dot" /> Ready
        <span className="side__ver">v{version ?? '0.0.0'}</span>
      </div>
    </nav>
  );
}
