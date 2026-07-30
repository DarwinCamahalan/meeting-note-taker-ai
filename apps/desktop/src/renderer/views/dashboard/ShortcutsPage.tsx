import type { AppStatus } from '@cue/types';

interface Shortcut {
  keys: string[];
  label: string;
}

function shortcutsFor(platform: string): Shortcut[] {
  const mod = platform === 'darwin' ? '⌘' : 'Ctrl';
  const shift = platform === 'darwin' ? '⇧' : 'Shift';
  return [
    { keys: [mod, '\\'], label: 'Show or hide the cue overlay' },
    { keys: [mod, shift, 'E'], label: 'End the current session' },
    { keys: ['Esc'], label: 'End the current session (quick bail-out)' },
  ];
}

export function ShortcutsPage({ status }: { status: AppStatus | null }): React.JSX.Element {
  const rows = shortcutsFor(status?.platform ?? 'darwin');
  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">Shortcuts</h1>
        <p className="page__sub">
          Global hotkeys — they work from any application while AssistMe is running.
        </p>
      </div>

      <div className="keys">
        {rows.map((s) => (
          <div className="keys__row" key={s.label}>
            <div className="keys__combo">
              {s.keys.map((k, i) => (
                <kbd className="kbd" key={`${s.label}-${i}`}>
                  {k}
                </kbd>
              ))}
            </div>
            <span className="keys__label">{s.label}</span>
          </div>
        ))}
      </div>

      <p className="page__note">
        Escape is currently registered globally and will be scoped to the overlay in a future build.
      </p>
    </div>
  );
}
