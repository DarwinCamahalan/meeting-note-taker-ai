import type { AudioSource } from '../types';

/**
 * Compact segmented control choosing what AssistMe listens to. Disabled while a
 * session is active (the source can't change mid-capture). Presentational only.
 */
interface SourceSelectorProps {
  value: AudioSource;
  disabled: boolean;
  onChange(source: AudioSource): void;
}

const OPTIONS: ReadonlyArray<{ value: AudioSource; label: string; title: string }> = [
  { value: 'mic', label: 'Me', title: 'Only your microphone' },
  { value: 'system', label: 'Them', title: 'Only the other participants (system audio)' },
  { value: 'both', label: 'Both', title: 'Your mic + system audio, mixed' },
];

export function SourceSelector(props: SourceSelectorProps): React.JSX.Element {
  const { value, disabled, onChange } = props;
  return (
    <div className="source no-drag" role="radiogroup" aria-label="Audio source">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          title={opt.title}
          disabled={disabled}
          className={`source__opt${value === opt.value ? ' source__opt--active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
