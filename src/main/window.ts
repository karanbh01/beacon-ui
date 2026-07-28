import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'

/**
 * Default geometry. Persistence and min-size enforcement land in BU-3.
 */
const DEFAULT_WIDTH = 1440
const DEFAULT_HEIGHT = 1024

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    show: false,
    autoHideMenuBar: false,
    backgroundColor: '#101112',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Show only once the first paint is ready, so launch has no white flash.
  window.on('ready-to-show', () => {
    window.show()
  })

  // External links leave the app rather than navigating the shell away.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl !== undefined && devServerUrl !== '') {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
