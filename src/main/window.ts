import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'
import { DEFAULT_HEIGHT, DEFAULT_WIDTH, MIN_HEIGHT, MIN_WIDTH } from './windowGeometry'
import { persistWindowState, restoredBounds, wasMaximized } from './windowState'

export function createMainWindow(): BrowserWindow {
  const saved = restoredBounds()

  const window = new BrowserWindow({
    ...(saved ?? { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    // The renderer draws its own menu bar (BU-15), so Electron's native one
    // would sit directly above it as a second row of File/Edit/View. Hidden
    // rather than removed: Alt still reveals it, so the standard accelerators
    // and the devtools shortcut survive. On macOS the app menu lives in the
    // system bar and never duplicates, so this is a no-op there.
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
