import { ipcMain, type BrowserWindow } from 'electron';
import type { CuePipeline } from '@cue/core';
import type {
  AppSettings,
  AppStatus,
  AudioChunk,
  AuthState,
  CueEvent,
  SessionState,
  TranscriptEvent,
} from '@cue/types';
import type { AuthManager } from './auth';
import { loadSettings, saveSettings } from './settings';

/** IPC channel names — single source of truth for request + event sides. */
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
  status: 'cue:status',
  settingsGet: 'cue:settings:get',
  settingsSet: 'cue:settings:set',
  startListening: 'cue:start-listening',
  stopListening: 'cue:stop-listening',
} as const;

/** Everything the IPC bridge needs. Two windows: framed dashboard + HUD overlay. */
export interface IpcContext {
  dashboard: BrowserWindow;
  overlay: BrowserWindow;
  pipeline: CuePipeline;
  auth: AuthManager;
  /** Snapshot of runtime status for the dashboard panel. */
  getStatus: () => AppStatus;
}

/**
 * Bridge the renderer's `window.cue` API to the pipeline, auth, settings, and
 * window management. Pipeline push events (state/transcript/cue) target the
 * OVERLAY (the listening window); auth events go to both windows.
 */
export function registerIpc(ctx: IpcContext): void {
  const { dashboard, overlay, pipeline, auth } = ctx;

  // --- session pipeline ---
  ipcMain.handle(CHANNEL.start, () => pipeline.start());
  ipcMain.handle(CHANNEL.stop, () => pipeline.stop());
  ipcMain.on(CHANNEL.audio, (_event, chunk: AudioChunk) => pipeline.pushAudio(chunk));

  // --- window management ---
  ipcMain.handle(CHANNEL.toggle, () => {
    if (overlay.isVisible()) overlay.hide();
    else overlay.showInactive();
  });
  ipcMain.handle(CHANNEL.startListening, () => {
    overlay.showInactive();
    if (!dashboard.isDestroyed()) dashboard.hide();
  });
  ipcMain.handle(CHANNEL.stopListening, async () => {
    await pipeline.stop();
    if (!overlay.isDestroyed()) overlay.hide();
    if (!dashboard.isDestroyed()) dashboard.show();
  });

  // --- dashboard data ---
  ipcMain.handle(CHANNEL.status, (): AppStatus => ctx.getStatus());
  ipcMain.handle(CHANNEL.settingsGet, (): AppSettings => loadSettings());
  ipcMain.handle(CHANNEL.settingsSet, (_event, patch: Partial<AppSettings>): AppSettings =>
    saveSettings(patch),
  );

  // --- auth ---
  ipcMain.handle(CHANNEL.authLogin, () => auth.login());
  ipcMain.handle(CHANNEL.authLogout, () => auth.logout());
  ipcMain.handle(CHANNEL.authState, () => auth.getState());

  // --- push events (main -> renderer), guarded against torn-down windows ---
  const sendTo = (win: BrowserWindow, channel: string, payload: unknown): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  };

  pipeline.onState((s: SessionState) => sendTo(overlay, CHANNEL.state, s));
  pipeline.onTranscript((t: TranscriptEvent) => sendTo(overlay, CHANNEL.transcript, t));
  pipeline.onCue((e: CueEvent) => sendTo(overlay, CHANNEL.cue, e));
  auth.onState((s: AuthState) => {
    sendTo(overlay, CHANNEL.authStateEvent, s);
    sendTo(dashboard, CHANNEL.authStateEvent, s);
  });
}
