import { globalShortcut } from 'electron';

/** Actions the global shortcuts drive; supplied by the main coordinator. */
export interface ShortcutActions {
  /** Show/hide the overlay window. */
  toggleOverlay(): void;
  /** Tear down the active session (stop STT + cue generation). */
  endSession(): void;
}

/** Toggle the overlay's visibility. */
const TOGGLE_OVERLAY = 'CommandOrControl+\\';
/** End the current session. */
const END_SESSION = 'CommandOrControl+Shift+E';
/**
 * `Escape` also ends the session for quick bail-out.
 *
 * TODO(phase-1): registering Escape as a GLOBAL shortcut swallows Escape in
 * every application while Cue runs, which is too intrusive for a shipping
 * build. Move this to a window-local binding (webContents `before-input-event`
 * or a renderer key handler) so it only fires when the overlay has focus.
 */
const END_SESSION_ESCAPE = 'Escape';

/** Register an accelerator, logging (rather than throwing) if the OS rejects it. */
function register(accelerator: string, handler: () => void): void {
  const ok = globalShortcut.register(accelerator, handler);
  if (!ok) {
    console.warn(`[cue] Failed to register global shortcut: ${accelerator}`);
  }
}

/** Register all Cue global shortcuts. Idempotent per accelerator. */
export function registerGlobalShortcuts(actions: ShortcutActions): void {
  register(TOGGLE_OVERLAY, () => actions.toggleOverlay());
  register(END_SESSION, () => actions.endSession());
  register(END_SESSION_ESCAPE, () => actions.endSession());
}

/** Release every global shortcut; call on app teardown. */
export function unregisterAll(): void {
  globalShortcut.unregisterAll();
}
