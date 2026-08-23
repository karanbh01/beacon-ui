import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { APP_ORIGIN } from './appProtocol'
import { devIcon } from './icon'

/** Figma 0:1 — frames 2:2 and 4:8. */
const WIDTH = 573
const HEIGHT = 883

/**
 * The startup window (Figma 0:1).
 *
 * Frameless like the main window, and for the same reason: the frame draws
 * its own 42px title bar with the window controls on it. That is not
 * decoration — someone whose engine will not start has to be able to close
 * this without reaching for the task manager.
 *
 * Not resizable, but it IS on the taskbar (BU-97). It used to set
 * `skipTaskbar` to avoid being a second entry beside the main window — except
 * there is no second entry to avoid, because the main window is built hidden
 * and a hidden window has no taskbar presence either. The two together gave
 * the app none at all for as long as the engine took to start, which on a
 * first launch is a minute or more of looking like nothing is running.
 *
 * `#splash` selects what the renderer mounts. A second Vite entry would mean
 * a second HTML file, a second bundle and a second copy of the token and font
 * CSS, to show four lines of text.
 */
export function createSplashWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    ...devIcon,
    // The dark canvas token, as in window.ts: only visible before the first
    // frame, but a stale literal would flash a colour no longer in the
    // palette.
    backgroundColor: '#232323',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Both, for the reason set out in window.ts: `ready-to-show` waits for a
  // first frame that a never-shown window may never paint.
  const reveal = (): void => {
    if (!window.isDestroyed() && !window.isVisible()) window.show()
  }
  window.once('ready-to-show', reveal)
  window.webContents.once('did-finish-load', reveal)

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (devServerUrl !== undefined && devServerUrl !== '') {
    void window.loadURL(`${devServerUrl}#splash`)
  } else {
    void window.loadURL(`${APP_ORIGIN}/index.html#splash`)
  }

  return window
}
