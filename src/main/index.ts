import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { EngineState } from '@shared/ipc'
import { registerAppScheme, serveRenderer } from './appProtocol'
import { Engine } from './engine/engine'
import { forwardEngineChanges, registerIpcHandlers } from './ipc'
import { createMainWindow } from './window'

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

  registerIpcHandlers(engine)
  engine.start()

  const window = createMainWindow()
  forwardEngineChanges(engine, window)

  app.on('activate', () => {
    // macOS: re-open a window when the dock icon is clicked and none are open.
    if (BrowserWindow.getAllWindows().length === 0) {
      forwardEngineChanges(engine, createMainWindow())
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
})

process.on('exit', () => {
  engine.stop()
})
