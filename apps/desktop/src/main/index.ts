import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import type { CuePipeline } from '@cue/core';
import type { AppStatus, SessionKind } from '@cue/types';
import { createDashboardWindow, createOverlayWindow } from './window';
import { registerDisplayMediaHandler } from './loopback';
import { createPipeline, resolveBackend, type CueBackend } from './pipeline-runner';
import { AuthManager } from './auth';
import { registerIpc } from './ipc';
import { loadSettings } from './settings';
import { registerGlobalShortcuts, unregisterAll, type ShortcutActions } from './shortcuts';
import { startAutoUpdate, stopAutoUpdate } from './updater';

/**
 * AssistMe main-process COORDINATOR. Opens the framed DASHBOARD window on launch
 * and a hidden, content-protected OVERLAY (revealed by Start Listening). Wires
 * AuthManager -> createPipeline -> registerIpc -> global shortcuts, plus app
 * lifecycle + the single-instance lock. Backend is chosen from `CUE_BACKEND`
 * (default `local`); STT defaults to free local-whisper unless Deepgram is set.
 */

/** Read the Anthropic key, warning loudly if absent (cues need it). */
function readAnthropicKey(): string {
  const value = process.env['ANTHROPIC_API_KEY'];
  if (!value) {
    console.error('[cue] Missing ANTHROPIC_API_KEY; set it in .env before starting a session.');
    return '';
  }
  return value;
}

const VALID_SESSION_KINDS: readonly SessionKind[] = [
  'interview_prep',
  'interview_live',
  'sales',
  'support',
  'meeting_notes',
];

/** Read the configured gateway session kind, defaulting to `interview_live`. */
function readSessionKind(): SessionKind {
  const raw = process.env['CUE_SESSION_KIND'];
  return VALID_SESSION_KINDS.includes(raw as SessionKind) ? (raw as SessionKind) : 'interview_live';
}

let dashboardWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let pipeline: CuePipeline | null = null;
let auth: AuthManager | null = null;

async function bootstrap(): Promise<void> {
  // Preload is emitted alongside main by electron-vite (out/preload/index.js).
  const preloadPath = join(__dirname, '../preload/index.js');

  dashboardWindow = createDashboardWindow(preloadPath);
  overlayWindow = createOverlayWindow(preloadPath);

  // Route renderer getDisplayMedia() to a system-audio loopback track so capture
  // hears the far side of the call. Registered once on the default session.
  registerDisplayMediaHandler();

  const apiBaseUrl = process.env['CUE_API_BASE_URL'] ?? 'http://localhost:3001';
  auth = new AuthManager({ apiBaseUrl });
  await auth.init();

  const settings = loadSettings();
  const backend: CueBackend = resolveBackend(process.env);
  // STT: free offline local-whisper unless a Deepgram key / STT_PROVIDER opts in.
  const sttProvider: 'deepgram' | 'local-whisper' =
    process.env['STT_PROVIDER'] === 'deepgram' || process.env['STT_PROVIDER'] === 'local-whisper'
      ? process.env['STT_PROVIDER']
      : process.env['DEEPGRAM_API_KEY']
        ? 'deepgram'
        : 'local-whisper';

  pipeline = createPipeline({
    backend,
    local: {
      anthropicApiKey: readAnthropicKey(),
      sttProvider,
      ...(process.env['DEEPGRAM_API_KEY']
        ? { deepgramApiKey: process.env['DEEPGRAM_API_KEY'] }
        : {}),
      ...(sttProvider === 'local-whisper'
        ? { whisper: { model: settings.whisperModel, language: settings.language } }
        : {}),
    },
    ...(backend === 'gateway'
      ? {
          gateway: {
            api: auth.getClient(),
            sessionKind: readSessionKind(),
            disclosed: process.env['CUE_DISCLOSED'] === 'true',
            language: settings.language,
            ...(process.env['CUE_WS_URL'] ? { wsUrlOverride: process.env['CUE_WS_URL'] } : {}),
          },
        }
      : {}),
  });

  const getStatus = (): AppStatus => ({
    sttProvider,
    whisperModel: settings.whisperModel,
    anthropicKeyPresent: Boolean(process.env['ANTHROPIC_API_KEY']),
    backend,
    appVersion: app.getVersion(),
    platform: process.platform,
  });

  registerIpc({
    dashboard: dashboardWindow,
    overlay: overlayWindow,
    pipeline,
    auth,
    getStatus,
  });

  const actions: ShortcutActions = {
    toggleOverlay: () => {
      if (!overlayWindow) return;
      if (overlayWindow.isVisible()) overlayWindow.hide();
      else overlayWindow.showInactive();
    },
    endSession: () => {
      void pipeline?.stop();
    },
  };
  registerGlobalShortcuts(actions);

  // Signed auto-update — gated behind an INDEPENDENT manifest signature check.
  // Disabled during dev and when the feed is unset.
  if (app.isPackaged) {
    startAutoUpdate({
      ...(process.env['RELEASES_URL'] ? { feedUrl: process.env['RELEASES_URL'] } : {}),
      ...(process.env['UPDATE_MANIFEST_PUBLIC_KEY']
        ? { publicKey: process.env['UPDATE_MANIFEST_PUBLIC_KEY'] }
        : {}),
    });
  }
}

// Single-instance lock: a second launch focuses the existing dashboard.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = dashboardWindow ?? overlayWindow;
    if (win && !win.isDestroyed()) {
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });

  app.whenReady().then(bootstrap).catch((err: unknown) => {
    console.error('[cue] Failed to start:', err);
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void bootstrap().catch((err: unknown) => {
        console.error('[cue] Failed to re-activate:', err);
      });
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  unregisterAll();
  stopAutoUpdate();
  void pipeline?.stop();
});
