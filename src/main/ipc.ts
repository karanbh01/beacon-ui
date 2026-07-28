import { app, ipcMain } from 'electron'
import type { AppInfo, IpcChannel, IpcResponse } from '@shared/ipc'

/**
 * Register a handler with the channel's contract type enforced. Adding a
 * channel to `IpcContract` without registering it here is a compile error at
 * the call site in preload, not a runtime "no handler registered" crash.
 */
function handle<C extends IpcChannel>(
  channel: C,
  handler: () => IpcResponse<C> | Promise<IpcResponse<C>>
): void {
  ipcMain.handle(channel, () => handler())
}

export function registerIpcHandlers(): void {
  handle('app:info', (): AppInfo => {
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    }
  })
}
