import { join } from 'node:path';
import { BrowserWindow, screen } from 'electron';
import type { WindowView } from '@cue/types';

/**
 * Two windows share one renderer bundle, distinguished by a `?view=` query:
 *   - `dashboard` — a normal framed control window (settings + Start Listening),
 *     shown on launch.
 *   - `overlay` — the transparent, frameless, always-on-top, content-protected
 *     teleprompter HUD, created hidden and revealed when a session starts.
 */

function sharedWebPreferences(preloadPath: string) {
  return {
    preload: preloadPath,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  };
}

/** Load the renderer (dev server or built file) for a specific view. */
function loadView(win: BrowserWindow, view: WindowView): void {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    void win.loadURL(`${devServerUrl}?view=${view}`);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query: { view } });
  }
}

/** The framed dashboard / settings window shown on launch. */
export function createDashboardWindow(preloadPath: string): BrowserWindow {
  const win = new BrowserWindow({
    // useContentSize: width/height are the WEB content area (excludes the title
    // bar), so we can size the window to the tallest page (Home ≈ 849px at the
    // min width) and never show a vertical scrollbar.
    useContentSize: true,
    width: 1080,
    height: 880,
    minWidth: 960,
    minHeight: 860,
    title: 'AssistMe',
    show: false,
    backgroundColor: '#0b0e13',
    webPreferences: sharedWebPreferences(preloadPath),
  });
  loadView(win, 'dashboard');
  win.once('ready-to-show', () => win.show());
  return win;
}

/**
 * Create the content-protected overlay window (created hidden; revealed by the
 * dashboard's Start Listening → `cue:start-listening`).
 *
 * @param preloadPath Absolute path to the compiled preload script.
 */
export function createOverlayWindow(preloadPath: string): BrowserWindow {
  const primary = screen.getPrimaryDisplay();
  const { x: workX, y: workY, width: workWidth } = primary.workArea;

  const overlayWidth = Math.min(760, workWidth - 40);
  const overlayHeight = 220;

  const win = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x: workX + Math.round((workWidth - overlayWidth) / 2),
    y: workY + 24,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: sharedWebPreferences(preloadPath),
  });

  // --- Content protection -------------------------------------------------
  // setContentProtection(true) keeps this window out of screen capture:
  //   - macOS:   NSWindowSharingType = none.
  //   - Windows: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE).
  // Excludes the WINDOW from capture/recording/share only — the process stays
  // fully visible to the OS / Activity Monitor / Task Manager / EDR agents.
  win.setContentProtection(true);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  loadView(win, 'overlay');
  return win;
}
