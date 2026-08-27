import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { APP_ORIGIN } from './appProtocol'
import { devIcon } from './icon'
import { guardNavigation } from './window'

/**
 * Enough for what is in it, and no more (BU-111).
 *
 * Grew by 110 when replacing the data moved in (BU-116): the body does not
 * scroll, so anything that does not fit is simply not readable, and the note
 * about BEACON_DATA_PATH was the part that fell off the bottom.
 */
const WIDTH = 520
const HEIGHT = 490

let open: BrowserWindow | null = null

/**
 * The data-settings window (BU-111).
 *
 * Modal to the splash rather than a panel inside it: the splash is a fixed
 * 573x883 frame read straight from Figma, and growing a settings section into
 * it would mean redrawing that frame. A child window keeps the splash exactly
 * as specified and makes the settings dismissible on their own.
 *
 * `#settings` selects what the shared renderer bundle mounts, the same seam
 * `#splash` uses — one bundle, three windows.
 */
export function openSettingsWindow(parent: BrowserWindow | null): BrowserWindow {
  if (open !== null && !open.isDestroyed()) {
    open.focus()
    return open
  }

  const window = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    // Modal only when there is a parent: a settings window with no owner that
    // blocks nothing is better than one that cannot be reached.
    ...(parent === null || parent.isDestroyed() ? {} : { parent, modal: true }),
    backgroundColor: '#232323',
    ...devIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  open = window
  guardNavigation(window)
  window.once('ready-to-show', () => {
    window.show()
  })
  window.on('closed', () => {
    open = null
  })

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (devServerUrl !== undefined && devServerUrl !== '') {
    void window.loadURL(`${devServerUrl}#settings`)
  } else {
    void window.loadURL(`${APP_ORIGIN}/index.html#settings`)
  }

  return window
}

export function closeSettingsWindow(): void {
  if (open !== null && !open.isDestroyed()) open.close()
  open = null
}
