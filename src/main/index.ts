import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { EngineState, UpdateState } from '@shared/ipc'
import { registerAppScheme, serveRenderer } from './appProtocol'
import { Engine } from './engine/engine'
import { forwardEngineChanges, forwardUpdateChanges, registerIpcHandlers } from './ipc'
import { Updater } from './updater'
import { createSplashWindow } from './splash'
import { createMainWindow, revealMainWindow } from './window'

// Windows: gives notifications and the taskbar a stable identity.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.beacon.ui')
}

// Must run before the app is ready: privileged schemes cannot be registered
// afterwards.
registerAppScheme()

const engine = new Engine({
  // Set BEACON_SERVER_URL to attach to a server you are running yourself,
  // rather than having this process spawn and own one.
  serverUrl: process.env.BEACON_SERVER_URL,
  pythonPath: process.env.BEACON_PYTHON,
  appRoot: app.getAppPath(),
  // Only when packaged: a dev run must keep using the sibling checkout, and
  // `process.resourcesPath` in dev points at Electron's own resources, which
  // hold no python payload.
  ...(app.isPackaged ? { resourcesPath: process.resourcesPath } : {})
})

/**
 * No feed unless packaged: electron-updater reads `app-update.yml` out of the
 * app's resources, which only electron-builder puts there. A dev run would
 * throw on the first check rather than report anything useful, so it gets an
 * inert updater instead — every action a no-op, status permanently idle.
 */
const updater = new Updater(app.isPackaged ? autoUpdater : undefined)

updater.on('log', (line: string) => {
  process.stderr.write(`[update] ${line}\n`)
})

updater.on('change', (state: UpdateState) => {
  const percent = state.percent === undefined ? '' : ` ${String(state.percent)}%`
  const version = state.version === undefined ? '' : ` ${state.version}`
  process.stderr.write(`[update] ${state.status}${version}${percent}\n`)
})

engine.on('log', (line: string) => {
  // Server stderr, surfaced so a failed start is diagnosable from the same
  // terminal that ran `pnpm dev`.
  process.stderr.write(`[py-beacon] ${line}`)
})

engine.on('change', (state: EngineState) => {
  // Every transition, timestamped. Without this a restart is invisible —
  // the footer only shows the current state, so a degraded window shorter
  // than a glance leaves no evidence it happened.
  const detail = state.detail === undefined ? '' : ` — ${state.detail}`
  process.stderr.write(`[engine] ${new Date().toISOString()} ${state.status}${detail}\n`)
})

void app.whenReady().then(() => {
  // Only needed when there is no dev server; in dev the renderer is served
  // over http by vite and already has a real origin.
  if (process.env.ELECTRON_RENDERER_URL === undefined) {
    serveRenderer(join(__dirname, '..', 'renderer'))
  }

  /*
   * The splash goes up first and the app waits behind it (BU-66).
   *
   * Both windows are created now rather than the app being built after the
   * engine answers: the renderer has its own work to do — fonts, tokens, the
   * workspace store — and doing it behind the splash is the whole point of
   * having one. It is simply not shown until the splash says so.
   */
  const splash = createSplashWindow()
  const window = createMainWindow({ deferShow: true })

  /*
   * Reaching the app means the engine is wanted (BU-115).
   *
   * `start` is idempotent, so calling it here as well as from the splash's
   * own Start costs nothing and closes the gap where the app could be shown
   * with no engine behind it.
   */
  let handedOver = false
  const handOver = (): void => {
    handedOver = true
    engine.start()
    revealMainWindow(window)
    if (!splash.isDestroyed()) splash.close()
  }

  registerIpcHandlers(engine, updater, { onSplashDone: handOver })
  updater.start()

  /*
   * Closing the splash is leaving, not entering.
   *
   * It used to hand over, so the X opened the app — the opposite of what a
   * close button means, and unreachable to undo, since the splash is gone by
   * then. Quitting is also the only way out: the main window exists but is
   * hidden, so `window-all-closed` never fires and the process would sit
   * there with nothing on screen.
   *
   * The hand-over closes this window itself, which is why the flag is needed
   * — that close must not quit the app it just opened.
   */
  splash.on('closed', () => {
    if (!handedOver) app.quit()
  })

  forwardEngineChanges(engine, splash)
  forwardUpdateChanges(updater, splash)
  forwardEngineChanges(engine, window)
  forwardUpdateChanges(updater, window)

  app.on('activate', () => {
    // macOS: re-open a window when the dock icon is clicked and none are open.
    if (BrowserWindow.getAllWindows().length === 0) {
      const reopened = createMainWindow()
      forwardEngineChanges(engine, reopened)
      forwardUpdateChanges(updater, reopened)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Kill the child on every exit path. Without this a crashed or force-quit app
// leaves an orphaned python holding its port.
app.on('before-quit', () => {
  engine.stop()
  updater.stop()
})

process.on('exit', () => {
  engine.stop()
})
