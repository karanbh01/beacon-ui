import { contextBridge, ipcRenderer } from 'electron'
import type { AppInfo, BeaconBridge } from '@shared/ipc'

/**
 * The only object the renderer can reach. Every member maps to a channel in
 * `IpcContract`; nothing else from Node or Electron crosses the boundary.
 */
const bridge: BeaconBridge = {
  appInfo: () => ipcRenderer.invoke('app:info') as Promise<AppInfo>
}

contextBridge.exposeInMainWorld('beacon', bridge)
