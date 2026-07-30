/**
 * One-time recording-disclosure gate shown before system-audio (loopback)
 * capture is enabled. Presentational only — the acknowledgement is persisted by
 * the caller via {@link useSystemAudioConsent}.
 */
interface ConsentDialogProps {
  open: boolean;
  onAcknowledge(): void;
  onCancel(): void;
}

export function ConsentDialog(props: ConsentDialogProps): React.JSX.Element | null {
  const { open, onAcknowledge, onCancel } = props;
  if (!open) {
    return null;
  }

  return (
    <div className="consent no-drag" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="consent__card">
        <h2 id="consent-title" className="consent__title">
          Capturing other participants&rsquo; audio
        </h2>
        <p className="consent__body">
          System audio can include other people on the call. You are responsible for having their
          consent and for complying with recording laws where you and they are located.
        </p>
        <div className="consent__actions">
          <button type="button" className="consent__btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="consent__btn consent__btn--primary"
            onClick={onAcknowledge}
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  );
}
