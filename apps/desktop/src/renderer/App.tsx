import { useMemo } from 'react';
import { Dashboard } from './views/Dashboard';
import { SessionApp } from './views/SessionApp';
import './styles.css';

/**
 * Renderer entry. One bundle serves two windows, chosen by the `?view=` query
 * the main process appends: `dashboard` (framed control window) or the default
 * `overlay` (content-protected listening HUD).
 */
export function App(): React.JSX.Element {
  const view = useMemo(() => new URLSearchParams(window.location.search).get('view'), []);
  return view === 'dashboard' ? <Dashboard /> : <SessionApp />;
}
