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
}

export type IpcChannel = keyof IpcContract

export type IpcRequest<C extends IpcChannel> = IpcContract[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response']

/** The surface preload publishes on `window.beacon`. */
export interface BeaconBridge {
  appInfo: () => Promise<AppInfo>
}
