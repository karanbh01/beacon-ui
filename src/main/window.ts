import { join } from 'node:path'
import { APP_ORIGIN } from './appProtocol'
import { app, BrowserWindow, shell } from 'electron'
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
/**
 * Kept in step with `--menu-bar-height` in MenuBar.css by hand — main cannot
 * read the renderer's CSS, and there is no way to make this follow it. The
 * traffic lights are ~14px tall, so this centres them on a 48px bar; if the
 * bar height changes and this does not, they sit visibly off it.
 */
const TRAFFIC_LIGHT_Y = 17

const frameOptions = isMac
  ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: TRAFFIC_LIGHT_Y } }
  : { frame: false }

/**
 * The window icon, in development only (BU-73).
 *
 * A packaged build takes its icon from the executable on Windows and the
 * bundle on macOS, and `build/` is not inside the app there — pointing at it
 * would be a path that resolves during `pnpm dev` and silently does not once
 * shipped. Unpackaged, Electron would otherwise show its own default icon in
 * the taskbar, which makes the dev window look like somebody else's app.
 */
const devIcon = app.isPackaged ? {} : { icon: join(__dirname, '../../build/icon.png') }

export interface MainWindowOptions {
  /**
   * Hold the window back until something else says so.
   *
   * The splash is in front of it during startup, and two windows appearing at
   * once — one of them empty — is worse than one appearing late.
   */
  deferShow?: boolean
}

export function createMainWindow(options: MainWindowOptions = {}): BrowserWindow {
  const saved = restoredBounds()

  const window = new BrowserWindow({
    ...(saved ?? { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }),
    ...frameOptions,
    ...devIcon,
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

  persistWindowState(window)
  forwardMaximizeChanges(window)

  /*
   * Reveal the window, once.
   *
   * `ready-to-show` alone is a trap, and it cost a day of BU-33: it waits for
   * the renderer's FIRST FRAME, and a window that has never been shown is
   * `visibilityState: 'hidden'`, so its renderer may never paint one. The
   * event then never fires, `show()` is never called, and the window sits
   * there painting only its `backgroundColor` — laid out correctly, fully
   * styled, and completely invisible.
   *
   * `maximize()` makes that worse rather than better: on Windows it puts the
   * window on screen without marking the CONTENTS visible, so the failure
   * looks like a rendering bug instead of a window that was never shown. It
   * is therefore applied after the reveal, not before.
   *
   * `did-finish-load` is the belt to that braces — it fires on the document,
   * not on a frame, so it cannot deadlock the same way.
   */
  const reveal = (): void => {
    if (window.isDestroyed() || window.isVisible()) return
    window.show()
    if (wasMaximized()) window.maximize()
  }

  if (options.deferShow === true) {
    // The caller reveals it. `revealMainWindow` still has to exist as a
    // separate step, because the deadlock the comment above describes applies
    // just as much to a window revealed later.
    window.once('ready-to-show', () => undefined)
  } else {
    window.once('ready-to-show', reveal)
    window.webContents.once('did-finish-load', reveal)
  }

  /*
   * A packaged renderer that fails to load is otherwise silent: the window
   * opens, paints its background colour and stays blank, with the error only
   * visible in a devtools console nobody can open. Both of these go to
   * stderr, where the same terminal that launched the app can see them.
   */
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    process.stderr.write(`[renderer] failed to load ${url}: ${description} (${String(code)})
`)
  })

  window.webContents.on('console-message', (_event, level, message, line, source) => {
    if (level < 2) return
    process.stderr.write(`[renderer] ${source}:${String(line)} ${message}
`)
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
    // Not loadFile: a file:// document has an opaque origin, and the module
    // bundle is fetched with CORS, so it would never execute. See
    // appProtocol.ts.
    void window.loadURL(`${APP_ORIGIN}/index.html`)
  }

  revealers.set(window, reveal)
  return window
}

/**
 * Weak, so a closed window does not keep its reveal closure alive. The map
 * exists because `reveal` closes over the saved-maximised state and cannot be
 * reconstructed from the window alone.
 */
const revealers = new WeakMap<BrowserWindow, () => void>()

/** Show a window created with `deferShow`. */
export function revealMainWindow(window: BrowserWindow): void {
  revealers.get(window)?.()
}
