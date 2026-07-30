import { ipcMain, type BrowserWindow } from 'electron';
import type { CuePipeline } from '@cue/core';
import type { AudioChunk, AuthState, CueEvent, SessionState, TranscriptEvent } from '@cue/types';
import type { AuthManager } from './auth';

/**
 * IPC channel names — kept as a single source of truth for both the request
 * side (renderer -> main) and the event side (main -> renderer).
 */
const CHANNEL = {
  start: 'cue:start',
  stop: 'cue:stop',
  toggle: 'cue:toggle',
  audio: 'cue:audio',
  state: 'cue:state',
  transcript: 'cue:transcript',
  cue: 'cue:cue',
  authLogin: 'cue:auth:login',
  authLogout: 'cue:auth:logout',
  authState: 'cue:auth:state',
  authStateEvent: 'cue:auth-state',
} as const;

/**
 * Bridge the renderer's `window.cue` API to the pipeline + auth, and back.
 *
 * Request/response (`ipcMain.handle`):
 *   - `cue:start` / `cue:stop`        -> pipeline.start()/stop()
 *   - `cue:toggle`                    -> show/hide the overlay window
 *   - `cue:auth:login` / `:logout` / `:state` -> AuthManager
 * Fire-and-forget (`ipcMain.on`):
 *   - `cue:audio`                     -> pipeline.pushAudio(chunk)
 * Push events (main -> `win.webContents.send`):
 *   - `cue:state` / `cue:transcript` / `cue:cue` / `cue:auth-state`
 */
export function registerIpc(win: BrowserWindow, pipeline: CuePipeline, auth: AuthManager): void {
  ipcMain.handle(CHANNEL.start, () => pipeline.start());
  ipcMain.handle(CHANNEL.stop, () => pipeline.stop());
  ipcMain.handle(CHANNEL.toggle, () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.showInactive();
    }
  });

  ipcMain.handle(CHANNEL.authLogin, () => auth.login());
  ipcMain.handle(CHANNEL.authLogout, () => auth.logout());
  ipcMain.handle(CHANNEL.authState, () => auth.getState());

  ipcMain.on(CHANNEL.audio, (_event, chunk: AudioChunk) => {
    pipeline.pushAudio(chunk);
  });

  // Guard sends against a torn-down window (shortcuts/quit can race the pipeline).
  const send = (channel: string, payload: unknown): void => {
    if (win.isDestroyed()) return;
    win.webContents.send(channel, payload);
  };

  pipeline.onState((s: SessionState) => send(CHANNEL.state, s));
  pipeline.onTranscript((t: TranscriptEvent) => send(CHANNEL.transcript, t));
  pipeline.onCue((e: CueEvent) => send(CHANNEL.cue, e));
  auth.onState((s: AuthState) => send(CHANNEL.authStateEvent, s));
}
