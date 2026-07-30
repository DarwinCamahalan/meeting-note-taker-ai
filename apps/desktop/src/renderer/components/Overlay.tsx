import type { SessionState } from '@cue/types';
import type { AudioSource, CueVm } from '../types';
import { CueCard } from './CueCard';
import { SourceSelector } from './SourceSelector';
import { StatusIndicator } from './StatusIndicator';

interface OverlayProps {
  state: SessionState;
  cue: CueVm | null;
  /** Current interim transcript hypothesis (subtle context line). */
  partial: string;
  /** Whether a session is currently running (drives the Start/Stop label). */
  active: boolean;
  /** Selected audio source (mic / system / both). */
  source: AudioSource;
  onSourceChange(source: AudioSource): void;
  capturing: boolean;
  captureError: string | null;
  onStart(): void;
  onStop(): void;
  /** Optional header slot (Phase 1 auth affordance); omitted in the local path. */
  authSlot?: React.ReactNode;
}

/**
 * The overlay's root presentational layout. Pure view: all state comes in as
 * props from {@link App}. The top bar is an OS drag region (frameless window);
 * interactive controls opt out via the `no-drag` class in styles.css.
 */
export function Overlay(props: OverlayProps): React.JSX.Element {
  const {
    state,
    cue,
    partial,
    active,
    source,
    onSourceChange,
    capturing,
    captureError,
    onStart,
    onStop,
    authSlot,
  } = props;

  return (
    <main className="overlay" data-state={state}>
      <header className="overlay__bar">
        <StatusIndicator state={state} capturing={capturing} />
        <div className="overlay__actions">
          <SourceSelector value={source} disabled={active} onChange={onSourceChange} />
          {authSlot}
          <button
            type="button"
            className={`overlay__toggle no-drag${active ? ' overlay__toggle--stop' : ''}`}
            onClick={active ? onStop : onStart}
          >
            {active ? 'Stop' : 'Start'}
          </button>
        </div>
      </header>

      <CueCard cue={cue} thinking={state === 'thinking'} />

      {partial ? <p className="overlay__partial">{partial}</p> : null}
      {captureError ? <p className="overlay__error">Audio: {captureError}</p> : null}
    </main>
  );
}
