import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import {
  ENGINE_CHANGED,
  MAXIMIZE_CHANGED,
  UPDATE_CHANGED,
  type AppInfo,
  type EngineState,
  type IpcChannel,
  type IpcRequest,
  type IpcResponse,
  type OpenedReport,
  type UpdateState
} from '@shared/ipc'
import type { Engine } from './engine/engine'
import type { Updater } from './updater'

/**
 * Register a handler with the channel's contract type enforced. Adding a
 * channel to `IpcContract` without registering it here is a compile error at
 * the call site in preload, not a runtime "no handler registered" crash.
 */
function handle<C extends IpcChannel>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    request: IpcRequest<C>
  ) => IpcResponse<C> | Promise<IpcResponse<C>>
): void {
  ipcMain.handle(channel, (event, request: IpcRequest<C>) => handler(event, request))
}

/**
 * A filename safe to join onto a directory.
 *
 * The renderer supplies it, and the renderer is treated as hostile
 * (ADR-0001): `../../.bashrc` must not become a path outside the temp
 * directory. Everything but a conservative set is replaced rather than
 * stripped, so two different names cannot collapse into one.
 */
export function safeFilename(name: string, fallback = 'report.pdf'): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '')
  return cleaned === '' ? fallback : cleaned.slice(0, 120)
}

/** The window that sent the request, rather than a captured reference. */
function senderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

export interface IpcHandlerOptions {
  /** Called when the splash reports startup finished. */
  onSplashDone?: () => void
}

export function registerIpcHandlers(
  engine: Engine,
  updater: Updater,
  options: IpcHandlerOptions = {}
): void {
  handle('window:splashDone', () => {
    options.onSplashDone?.()
    return undefined
  })

  handle('engine:state', (): EngineState => engine.getState())

  handle('engine:restart', () => {
    engine.restart()
    return undefined
  })

  handle('update:state', (): UpdateState => updater.getState())

  // All three are fire-and-forget: the answer arrives as a pushed state
  // change, not as this call's return value, because the same transitions
  // also happen on the timer with nobody waiting on a promise.
  handle('update:check', () => {
    updater.check('user')
    return undefined
  })

  handle('update:download', () => {
    updater.download()
    return undefined
  })

  handle('update:install', () => {
    updater.install()
    return undefined
  })

  handle('app:info', (): AppInfo => {
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform
    }
  })

  handle('window:minimize', (event) => {
    senderWindow(event)?.minimize()
    return undefined
  })

  handle('window:toggleMaximize', (event) => {
    const window = senderWindow(event)
    if (window === null) return false
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
    return window.isMaximized()
  })

  handle('window:close', (event) => {
    senderWindow(event)?.close()
    return undefined
  })

  handle('window:isMaximized', (event) => senderWindow(event)?.isMaximized() ?? false)

  handle('report:open', async (_event, request): Promise<OpenedReport> => {
    const path = join(app.getPath('temp'), safeFilename(request.filename))
    try {
      await writeFile(path, request.bytes)
    } catch (cause) {
      return { path, error: cause instanceof Error ? cause.message : 'Could not write the file.' }
    }
    // openPath returns '' on success and the reason otherwise — it does not
    // throw, so a machine with no PDF viewer reports rather than crashes.
    return { path, error: await shell.openPath(path) }
  })
}

/**
 * Tell the renderer when the window is maximised or restored.
 *
 * Needed because our button is not the only route: double-clicking the drag
 * region and Windows snap gestures both change the state without the
 * renderer knowing, and the maximise glyph would then be wrong.
 */
/**
 * Push engine state to a window as it changes.
 *
 * The footer must never look healthier than the engine is, and polling from
 * the renderer would mean a window of time where it does.
 */
export function forwardEngineChanges(engine: Engine, window: BrowserWindow): void {
  const send = (state: EngineState): void => {
    if (window.isDestroyed()) return
    window.webContents.send(ENGINE_CHANGED, state)
  }
  engine.on('change', send)
  window.on('closed', () => {
    engine.off('change', send)
  })
}

/** Same contract as the engine's: the renderer is told, never left to poll. */
export function forwardUpdateChanges(updater: Updater, window: BrowserWindow): void {
  const send = (state: UpdateState): void => {
    if (window.isDestroyed()) return
    window.webContents.send(UPDATE_CHANGED, state)
  }
  updater.on('change', send)
  window.on('closed', () => {
    updater.off('change', send)
  })
}

export function forwardMaximizeChanges(window: BrowserWindow): void {
  const send = (): void => {
    if (window.isDestroyed()) return
    window.webContents.send(MAXIMIZE_CHANGED, window.isMaximized())
  }
  window.on('maximize', send)
  window.on('unmaximize', send)
}
