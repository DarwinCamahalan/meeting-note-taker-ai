import type { SessionState } from '@cue/types';
import type { CueVm } from '../types';
import { CueCard } from './CueCard';
import { StatusIndicator } from './StatusIndicator';

interface OverlayProps {
  state: SessionState;
  cue: CueVm | null;
  /** Current interim transcript hypothesis (subtle context line). */
  partial: string;
  /** Whether a session is currently running (drives the Start/Stop label). */
  active: boolean;
  capturing: boolean;
  captureError: string | null;
  onStart(): void;
  onStop(): void;
}

/**
 * The overlay's root presentational layout. Pure view: all state comes in as
 * props from {@link App}. The top bar is an OS drag region (frameless window);
 * interactive controls opt out via the `no-drag` class in styles.css.
 */
export function Overlay(props: OverlayProps): React.JSX.Element {
  const { state, cue, partial, active, capturing, captureError, onStart, onStop } = props;

  return (
    <main className="overlay" data-state={state}>
      <header className="overlay__bar">
        <StatusIndicator state={state} capturing={capturing} />
        <button
          type="button"
          className={`overlay__toggle no-drag${active ? ' overlay__toggle--stop' : ''}`}
          onClick={active ? onStop : onStart}
        >
          {active ? 'Stop' : 'Start'}
        </button>
      </header>

      <CueCard cue={cue} thinking={state === 'thinking'} />

      {partial ? <p className="overlay__partial">{partial}</p> : null}
      {captureError ? <p className="overlay__error">Mic: {captureError}</p> : null}
    </main>
  );
}
