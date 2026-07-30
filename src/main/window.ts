import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'
import { DEFAULT_HEIGHT, DEFAULT_WIDTH, MIN_HEIGHT, MIN_WIDTH } from './windowGeometry'
import { forwardMaximizeChanges } from './ipc'
import { persistWindowState, restoredBounds, wasMaximized } from './windowState'

const isMac = process.platform === 'darwin'

/**
 * Frameless chrome (BU-37). The menu bar is the title bar, so the OS must not
 * draw one above it.
 *
 * macOS keeps its traffic lights via `hiddenInset` and insets them to sit on
 * the 62px bar — hiding them there would break a system-level convention and
 * leave no way to close the window. Windows and Linux go fully frameless and
 * the renderer draws minimise / maximise / close itself.
 */
const frameOptions = isMac
  ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 23 } }
  : { frame: false }

export function createMainWindow(): BrowserWindow {
  const saved = restoredBounds()

  const window = new BrowserWindow({
    ...(saved ?? { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }),
    ...frameOptions,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    // The renderer draws its own menu bar (BU-15). Frameless already removes
    // the native one on Windows/Linux; this also covers the Alt-reveal path.
    autoHideMenuBar: true,
    // The dark canvas token. Only visible if ready-to-show is slow, but a
    // stale literal here would flash a colour that is no longer in the
    // palette. Kept in sync with tokens/colors.json canvas/dark by hand —
    // main cannot import the renderer's generated tokens.
    backgroundColor: '#232323',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (wasMaximized()) {
    window.maximize()
  }
  persistWindowState(window)
  forwardMaximizeChanges(window)

  // Show only once the first paint is ready, so launch has no white flash.
  window.on('ready-to-show', () => {
    window.show()
  })

  // External links leave the app rather than navigating the shell away.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (devServerUrl !== undefined && devServerUrl !== '') {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
