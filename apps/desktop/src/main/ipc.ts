import { ipcMain, type BrowserWindow } from 'electron';
import type { CuePipeline } from '@cue/core';
import type { AudioChunk, CueEvent, SessionState, TranscriptEvent } from '@cue/types';

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
} as const;

/**
 * Bridge the renderer's `window.cue` API to the pipeline and back.
 *
 * Request/response (`ipcMain.handle`):
 *   - `cue:start`  -> pipeline.start()
 *   - `cue:stop`   -> pipeline.stop()
 *   - `cue:toggle` -> show/hide the overlay window
 * Fire-and-forget (`ipcMain.on`):
 *   - `cue:audio`  -> pipeline.pushAudio(chunk)
 * Push events (pipeline -> `win.webContents.send`):
 *   - `cue:state` / `cue:transcript` / `cue:cue`
 */
export function registerIpc(win: BrowserWindow, pipeline: CuePipeline): void {
  ipcMain.handle(CHANNEL.start, () => pipeline.start());
  ipcMain.handle(CHANNEL.stop, () => pipeline.stop());
  ipcMain.handle(CHANNEL.toggle, () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.showInactive();
    }
  });

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
}
