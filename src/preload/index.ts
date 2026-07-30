import { contextBridge, ipcRenderer } from 'electron'
import { MAXIMIZE_CHANGED, type AppInfo, type BeaconBridge } from '@shared/ipc'

/**
 * The only object the renderer can reach. Every member maps to a channel in
 * `IpcContract`; nothing else from Node or Electron crosses the boundary.
 */
const bridge: BeaconBridge = {
  appInfo: () => ipcRenderer.invoke('app:info') as Promise<AppInfo>,
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize') as Promise<void>,
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize') as Promise<boolean>,
    close: () => ipcRenderer.invoke('window:close') as Promise<void>,
    isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
    onMaximizeChange: (listener) => {
      const handler = (_event: unknown, maximized: boolean): void => {
        listener(maximized)
      }
      ipcRenderer.on(MAXIMIZE_CHANGED, handler)
      // Returning the unsubscribe keeps the renderer from having to know the
      // channel name, which is the whole point of the bridge.
      return () => {
        ipcRenderer.removeListener(MAXIMIZE_CHANGED, handler)
      }
    }
  }
}

contextBridge.exposeInMainWorld('beacon', bridge)
