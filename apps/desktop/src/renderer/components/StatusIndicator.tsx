import type { SessionState } from '@cue/types';
import { stateLabel } from '../utils';

interface StatusIndicatorProps {
  state: SessionState;
  /** True while the mic is actively streaming PCM. */
  capturing: boolean;
}

/**
 * A compact, glanceable status pill: a colored dot (driven by session state)
 * plus a text label. The dot pulses while listening/thinking unless the user
 * prefers reduced motion (handled in styles.css).
 */
export function StatusIndicator({ state, capturing }: StatusIndicatorProps): React.JSX.Element {
  return (
    <div className="status" role="status" aria-live="polite">
      <span className={`status__dot status__dot--${state}`} aria-hidden="true" />
      <span className="status__label">{stateLabel(state)}</span>
      {capturing ? <span className="status__mic" aria-label="microphone active">mic</span> : null}
    </div>
  );
}
