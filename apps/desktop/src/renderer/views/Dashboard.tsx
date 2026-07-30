import { useState } from 'react';
import { Sidebar } from './dashboard/Sidebar';
import { HomePage } from './dashboard/HomePage';
import { SettingsPage } from './dashboard/SettingsPage';
import { ShortcutsPage } from './dashboard/ShortcutsPage';
import { AboutPage } from './dashboard/AboutPage';
import { useDashboard, type DashboardPage } from './dashboard/use-dashboard';

/**
 * The framed control window (`?view=dashboard`): a sidebar app shell that routes
 * between Home / Settings / Shortcuts / About. Shared runtime state comes from
 * {@link useDashboard}; the overlay (listening HUD) is a separate window.
 */
export function Dashboard(): React.JSX.Element {
  const [page, setPage] = useState<DashboardPage>('home');
  const data = useDashboard();

  return (
    <div className="app">
      <Sidebar active={page} onNavigate={setPage} version={data.status?.appVersion} />
      <main className="app__main">
        {page === 'home' && <HomePage data={data} />}
        {page === 'settings' && <SettingsPage data={data} />}
        {page === 'shortcuts' && <ShortcutsPage status={data.status} />}
        {page === 'about' && <AboutPage status={data.status} />}
      </main>
    </div>
  );
}
