'use client';

import { useSearchParams } from 'next/navigation';
import { useActivate } from './hooks/use-activate';

/**
 * Device-code activation screen. Reads `?code=` from the desktop-opened URL,
 * shows the code for the user to verify, and approves it against the `api`.
 */
export function ActivateScreen() {
  const params = useSearchParams();
  const deviceCode = params.get('code');
  const { state, approve } = useActivate(deviceCode);

  if (state.status === 'approved') {
    return (
      <div className="surface-card text-center">
        <SuccessGlyph />
        <h2 className="mt-4 text-xl font-semibold">Device approved</h2>
        <p className="mt-2 text-sm text-white/60">
          You can return to the Cue desktop app — it will finish signing in
          automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="surface-card">
      <h2 className="text-xl font-semibold">Activate Cue on your computer</h2>
      <p className="mt-2 text-sm text-white/60">
        Confirm this is the code shown in the Cue desktop app, then approve to
        finish signing in.
      </p>

      <div className="mt-6">
        <span className="text-xs uppercase tracking-widest text-white/40">
          Device code
        </span>
        <div className="mt-2 rounded-xl border border-white/10 bg-ink-950 px-4 py-3 font-mono text-lg tracking-[0.3em] text-cue-200">
          {deviceCode ?? '— — — —'}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void approve()}
        disabled={!deviceCode || state.status === 'approving'}
        className="btn-primary mt-6 w-full"
      >
        {state.status === 'approving' ? 'Approving…' : 'Approve this device'}
      </button>

      {state.error && (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {state.error}
        </p>
      )}

      <p className="mt-6 text-xs text-white/35">
        Only approve if you just started sign-in from the Cue app on this device.
      </p>

      <div className="mt-6 border-t border-white/10 pt-4 text-center">
        <a href="/signin" className="text-sm text-cue-200 transition hover:text-cue-100">
          Sign in with SSO
        </a>
      </div>
    </div>
  );
}

function SuccessGlyph() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      className="mx-auto text-cue-300"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 12l3 3 5-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
