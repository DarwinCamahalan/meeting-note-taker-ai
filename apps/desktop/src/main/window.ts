import { join } from 'node:path';
import { app, BrowserWindow, screen } from 'electron';

/**
 * Create the content-protected Cue overlay window.
 *
 * The overlay is a transparent, frameless, always-on-top HUD positioned as a
 * strip near the top of the primary display. It is excluded from screen
 * capture/recording/sharing so it stays invisible to the far side of a call.
 *
 * @param preloadPath Absolute path to the compiled preload script
 *                     (emitted by electron-vite at out/preload/index.js).
 */
export function createOverlayWindow(preloadPath: string): BrowserWindow {
  const primary = screen.getPrimaryDisplay();
  const { x: workX, y: workY, width: workWidth } = primary.workArea;

  const overlayWidth = Math.min(760, workWidth - 40);
  const overlayHeight = 220;

  const win = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    // Centre horizontally, pinned just below the top of the work area.
    x: workX + Math.round((workWidth - overlayWidth) / 2),
    y: workY + 24,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    // Reveal only once the renderer is ready, to avoid a transparent flash.
    show: false,
    webPreferences: {
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // --- Content protection -------------------------------------------------
  // setContentProtection(true) is the cross-platform switch that keeps this
  // window out of screen capture:
  //   - macOS:   sets the window's NSWindowSharingType to `none`.
  //   - Windows: calls SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE).
  // This excludes the WINDOW from capture/recording/share only. It does NOT
  // hide the process from the OS, Activity Monitor / Task Manager, or any
  // EDR / monitoring agent — Cue remains fully visible to the operating system.
  win.setContentProtection(true);

  // Float above full-screen apps and the screen saver, on every workspace.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // macOS: run as an accessory (agent) app — no Dock icon, no menu-bar focus
  // stealing — so the overlay behaves like a HUD rather than a foreground app.
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  // electron-vite serves the renderer from a dev server in `dev`, and emits a
  // static bundle for production builds.
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Show without stealing focus so the user keeps typing in their real app.
  win.once('ready-to-show', () => {
    win.showInactive();
  });

  return win;
}
