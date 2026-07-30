import type { CueVm } from '../types';

interface CueCardProps {
  /** The active cue, or `null` before the first cue of a session. */
  cue: CueVm | null;
  /** Session-level state, used for empty/thinking placeholder copy. */
  thinking: boolean;
}

/** Placeholder copy when there is no cue text to show yet. */
function placeholder(thinking: boolean): string {
  return thinking ? 'Thinking…' : 'Listening for something worth cueing…';
}

/**
 * The teleprompter surface: renders the current cue's streaming text in large,
 * high-contrast type. A `none` cue collapses back to the idle placeholder; an
 * `error` cue is styled distinctly. A blinking caret trails streaming text.
 */
export function CueCard({ cue, thinking }: CueCardProps): React.JSX.Element {
  const isError = cue?.status === 'error';
  const isStreaming = cue?.status === 'streaming';
  const hasText = cue !== null && cue.status !== 'none' && cue.text.length > 0;

  return (
    <div className={`cue-card${isError ? ' cue-card--error' : ''}`}>
      {hasText ? (
        <p className="cue-card__text">
          {cue.text}
          {isStreaming ? <span className="cue-card__caret" aria-hidden="true" /> : null}
        </p>
      ) : (
        <p className="cue-card__text cue-card__text--muted">{placeholder(thinking)}</p>
      )}
    </div>
  );
}
