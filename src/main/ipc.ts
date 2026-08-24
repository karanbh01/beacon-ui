import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
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
  type RegenerateResult,
  type SaveResult,
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

  /*
   * Replacing the demo store (BU-107).
   *
   * Confirmed through the OS dialog rather than a renderer modal: it discards
   * a couple of hundred megabytes and leaves the app without data for about
   * two minutes, which is the kind of thing that deserves the platform's own
   * "are you sure" rather than a div.
   */
  handle('engine:regenerate', async (event): Promise<RegenerateResult> => {
    const window = senderWindow(event)
    const message = {
      type: 'warning' as const,
      buttons: ['Replace', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Replace the data store',
      message: 'Replace the synthetic data store?',
      detail:
        'The current store is deleted and a new one generated. This takes a couple of minutes, and the app has no data until it finishes.\n\nYour universes, indices and watchlists are kept.'
    }

    const answer =
      window === null
        ? await dialog.showMessageBox(message)
        : await dialog.showMessageBox(window, message)
    if (answer.response !== 0) return { started: false }

    try {
      await engine.regenerate()
      return { started: true }
    } catch (cause) {
      return { started: false, problem: cause instanceof Error ? cause.message : String(cause) }
    }
  })

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

  /*
   * Export (BU-106).
   *
   * The renderer builds the bytes — it holds the rows, and a CSV or a
   * workbook is a pure function of them. Main only owns the two things a
   * renderer cannot do: ask where, and write there.
   *
   * Modal to the requesting window rather than application-modal, so a save
   * from one window does not freeze the other.
   */
  handle('file:save', async (event, request): Promise<SaveResult> => {
    const window = senderWindow(event)
    const filters =
      request.format === 'csv'
        ? [{ name: 'CSV', extensions: ['csv'] }]
        : [{ name: 'Excel workbook', extensions: ['xlsx'] }]

    const options = { defaultPath: request.suggestedName, filters }
    const chosen =
      window === null
        ? await dialog.showSaveDialog(options)
        : await dialog.showSaveDialog(window, options)

    // Cancelling is an answer, not a failure: throwing here would surface as
    // an error toast for someone who simply changed their mind.
    if (chosen.canceled || chosen.filePath === '') return { saved: false }

    await writeFile(chosen.filePath, Buffer.from(request.base64, 'base64'))
    return { saved: true, path: chosen.filePath }
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
