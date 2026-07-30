import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import type { CuePipeline } from '@cue/core';
import type { SessionKind } from '@cue/types';
import { createOverlayWindow } from './window';
import { registerDisplayMediaHandler } from './loopback';
import { createPipeline, resolveBackend, type CueBackend } from './pipeline-runner';
import { AuthManager } from './auth';
import { registerIpc } from './ipc';
import { registerGlobalShortcuts, unregisterAll, type ShortcutActions } from './shortcuts';
import { startAutoUpdate, stopAutoUpdate } from './updater';

/**
 * Cue main-process COORDINATOR (Phase 0 foundation + Phase 1 backend wiring).
 *
 * Responsibilities are deliberately thin — it only orchestrates the modules
 * that the Build phase owns:
 *   createOverlayWindow -> AuthManager -> createPipeline -> registerIpc ->
 *   registerGlobalShortcuts, plus app lifecycle and the single-instance lock.
 *
 * The pipeline backend is chosen from `CUE_BACKEND` (default `local`), so the
 * Phase 0 in-process path stays the default and is never regressed.
 */

/** Read a required secret from the environment, warning loudly if absent. */
function readKey(name: 'ANTHROPIC_API_KEY' | 'DEEPGRAM_API_KEY'): string {
  const value = process.env[name];
  if (!value) {
    // Spike: don't hard-crash, but the pipeline cannot reach its provider.
    console.error(`[cue] Missing required env var ${name}; set it in .env before starting a session.`);
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
  return VALID_SESSION_KINDS.includes(raw as SessionKind)
    ? (raw as SessionKind)
    : 'interview_live';
}

let overlayWindow: BrowserWindow | null = null;
let pipeline: CuePipeline | null = null;
let auth: AuthManager | null = null;

async function bootstrap(): Promise<void> {
  // Preload is emitted alongside main by electron-vite (out/preload/index.js).
  const preloadPath = join(__dirname, '../preload/index.js');

  overlayWindow = createOverlayWindow(preloadPath);

  // Route renderer getDisplayMedia() to a system-audio loopback track so the
  // capture pipeline can hear the far side of the call (consent-gated in the
  // renderer). Registered once, on the overlay's (default) session.
  registerDisplayMediaHandler();

  const apiBaseUrl = process.env['CUE_API_BASE_URL'] ?? 'http://localhost:3001';
  auth = new AuthManager({ apiBaseUrl });
  await auth.init();

  const backend: CueBackend = resolveBackend(process.env);
  pipeline = createPipeline({
    backend,
    local: {
      anthropicApiKey: readKey('ANTHROPIC_API_KEY'),
      deepgramApiKey: readKey('DEEPGRAM_API_KEY'),
    },
    ...(backend === 'gateway'
      ? {
          gateway: {
            api: auth.getClient(),
            sessionKind: readSessionKind(),
            disclosed: process.env['CUE_DISCLOSED'] === 'true',
            ...(process.env['CUE_WS_URL'] ? { wsUrlOverride: process.env['CUE_WS_URL'] } : {}),
            ...(process.env['CUE_LANGUAGE'] ? { language: process.env['CUE_LANGUAGE'] } : {}),
          },
        }
      : {}),
  });

  registerIpc(overlayWindow, pipeline, auth);

  const actions: ShortcutActions = {
    toggleOverlay: () => {
      if (!overlayWindow) return;
      if (overlayWindow.isVisible()) {
        overlayWindow.hide();
      } else {
        overlayWindow.showInactive();
      }
    },
    endSession: () => {
      void pipeline?.stop();
    },
  };
  registerGlobalShortcuts(actions);

  // Signed auto-update: gated behind an INDEPENDENT manifest signature check
  // (autoDownload=false until verified — see ./updater + ./update-verify).
  // Disabled during dev (no packaged app / feed) and when the feed is unset.
  if (app.isPackaged) {
    startAutoUpdate({
      ...(process.env['RELEASES_URL'] ? { feedUrl: process.env['RELEASES_URL'] } : {}),
      ...(process.env['UPDATE_MANIFEST_PUBLIC_KEY']
        ? { publicKey: process.env['UPDATE_MANIFEST_PUBLIC_KEY'] }
        : {}),
    });
  }
}

// Single-instance lock: a second launch focuses the existing overlay.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (overlayWindow) {
      if (!overlayWindow.isVisible()) overlayWindow.showInactive();
      overlayWindow.focus();
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

// Accessory overlay app: keep running when the (single) window closes on
// macOS, matching menu-bar/agent conventions. Quit elsewhere.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  unregisterAll();
  stopAutoUpdate();
  void pipeline?.stop();
});
