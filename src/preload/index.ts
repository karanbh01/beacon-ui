import { contextBridge, ipcRenderer } from 'electron'
import {
  ENGINE_CHANGED,
  MAXIMIZE_CHANGED,
  UPDATE_CHANGED,
  type AppInfo,
  type BeaconBridge,
  type EngineState,
  type OpenedReport,
  type UpdateState
} from '@shared/ipc'

/**
 * The only object the renderer can reach. Every member maps to a channel in
 * `IpcContract`; nothing else from Node or Electron crosses the boundary.
 */
const bridge: BeaconBridge = {
  appInfo: () => ipcRenderer.invoke('app:info') as Promise<AppInfo>,
  engine: {
    state: () => ipcRenderer.invoke('engine:state') as Promise<EngineState>,
    restart: () => ipcRenderer.invoke('engine:restart') as Promise<void>,
    onChange: (listener) => {
      const handler = (_event: unknown, state: EngineState): void => {
        listener(state)
      }
      ipcRenderer.on(ENGINE_CHANGED, handler)
      return () => {
        ipcRenderer.removeListener(ENGINE_CHANGED, handler)
      }
    }
  },
  update: {
    state: () => ipcRenderer.invoke('update:state') as Promise<UpdateState>,
    check: () => ipcRenderer.invoke('update:check') as Promise<void>,
    download: () => ipcRenderer.invoke('update:download') as Promise<void>,
    install: () => ipcRenderer.invoke('update:install') as Promise<void>,
    onChange: (listener) => {
      const handler = (_event: unknown, state: UpdateState): void => {
        listener(state)
      }
      ipcRenderer.on(UPDATE_CHANGED, handler)
      return () => {
        ipcRenderer.removeListener(UPDATE_CHANGED, handler)
      }
    }
  },
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
  },
  reports: {
    open: (filename, bytes) =>
      ipcRenderer.invoke('report:open', { filename, bytes }) as Promise<OpenedReport>
  }
}

contextBridge.exposeInMainWorld('beacon', bridge)
