/**
 * The IPC contract between main and renderer.
 *
 * This module is the single source of truth for channel names and their
 * payload/result types. It is imported by `src/main` (handler registration),
 * `src/preload` (bridge construction) and `src/renderer` (call sites), so a
 * channel cannot drift out of sync on one side without a typecheck failure.
 */

export interface AppInfo {
  /** beacon-ui's own version, from package.json. */
  version: string
  electron: string
  chrome: string
  node: string
  /** process.platform. The renderer draws window controls only off darwin. */
  platform: string
}

/**
 * Request/response shape per invoke channel.
 *
 * Add a channel by adding a key here; main must then register a matching
 * handler and preload must expose it, both of which are type-enforced.
 */
export interface IpcContract {
  'app:info': {
    /** No payload. */
    request: undefined
    response: AppInfo
  }
  'window:minimize': {
    request: undefined
    response: undefined
  }
  /** Toggles, and answers with the resulting maximised state. */
  'window:toggleMaximize': {
    request: undefined
    response: boolean
  }
  'window:close': {
    request: undefined
    response: undefined
  }
  'window:isMaximized': {
    request: undefined
    response: boolean
  }
}

export type IpcChannel = keyof IpcContract

export type IpcRequest<C extends IpcChannel> = IpcContract[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response']

/**
 * Main pushes this when the window is maximised or restored by any route —
 * our button, a double-click on the drag region, or an OS snap gesture. The
 * renderer cannot infer those last two, so it has to be told.
 */
export const MAXIMIZE_CHANGED = 'window:maximizeChanged'

/** The surface preload publishes on `window.beacon`. */
export interface BeaconBridge {
  appInfo: () => Promise<AppInfo>
  window: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<boolean>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    /** Returns an unsubscribe function. */
    onMaximizeChange: (listener: (maximized: boolean) => void) => () => void
  }
}
