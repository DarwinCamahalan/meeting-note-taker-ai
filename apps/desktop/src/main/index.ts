import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import type { CuePipeline } from '@cue/core';
import { createOverlayWindow } from './window';
import { createPipeline } from './pipeline-runner';
import { registerIpc } from './ipc';
import { registerGlobalShortcuts, unregisterAll, type ShortcutActions } from './shortcuts';

/**
 * Cue main-process COORDINATOR (Phase 0 foundation).
 *
 * Responsibilities are deliberately thin — it only orchestrates the modules
 * that the Build phase owns:
 *   createOverlayWindow -> createPipeline -> registerIpc -> registerGlobalShortcuts
 * plus app lifecycle and the single-instance lock.
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

let overlayWindow: BrowserWindow | null = null;
let pipeline: CuePipeline | null = null;

function bootstrap(): void {
  // Preload is emitted alongside main by electron-vite (out/preload/index.js).
  const preloadPath = join(__dirname, '../preload/index.js');

  overlayWindow = createOverlayWindow(preloadPath);

  pipeline = createPipeline({
    anthropicApiKey: readKey('ANTHROPIC_API_KEY'),
    deepgramApiKey: readKey('DEEPGRAM_API_KEY'),
  });

  registerIpc(overlayWindow, pipeline);

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
      bootstrap();
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
  void pipeline?.stop();
});
