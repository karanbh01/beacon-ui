import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  ENGINE_CHANGED,
  MAXIMIZE_CHANGED,
  type AppInfo,
  type EngineState,
  type IpcChannel,
  type IpcResponse
} from '@shared/ipc'
import type { Engine } from './engine/engine'

/**
 * Register a handler with the channel's contract type enforced. Adding a
 * channel to `IpcContract` without registering it here is a compile error at
 * the call site in preload, not a runtime "no handler registered" crash.
 */
function handle<C extends IpcChannel>(
  channel: C,
  handler: (event: IpcMainInvokeEvent) => IpcResponse<C> | Promise<IpcResponse<C>>
): void {
  ipcMain.handle(channel, (event) => handler(event))
}

/** The window that sent the request, rather than a captured reference. */
function senderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

export function registerIpcHandlers(engine: Engine): void {
  handle('engine:state', (): EngineState => engine.getState())

  handle('engine:restart', () => {
    engine.restart()
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

export function forwardMaximizeChanges(window: BrowserWindow): void {
  const send = (): void => {
    if (window.isDestroyed()) return
    window.webContents.send(MAXIMIZE_CHANGED, window.isMaximized())
  }
  window.on('maximize', send)
  window.on('unmaximize', send)
}
