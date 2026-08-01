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
/**
 * Lifecycle of the python server (BU-19).
 *
 * `degraded` is deliberately distinct from `stopped`: degraded means we
 * expect it back and a restart is in flight, stopped means we gave up. The
 * footer says different things for each, and conflating them would let the
 * app claim it is recovering forever.
 */
export type EngineStatus = 'starting' | 'connected' | 'degraded' | 'stopped'

export interface EngineState {
  status: EngineStatus
  /** py-beacon's version, from /health. Absent until first connect. */
  version?: string
  /** e.g. http://127.0.0.1:57020 — absent until the port is announced. */
  baseUrl?: string
  /**
   * Bearer token for the API and the `/ws?token=` socket.
   *
   * The renderer needs it to call anything. That is the design py-beacon
   * assumes — the server binds loopback only and trusts the token alone —
   * but it does mean the token lives in renderer memory, so it must never be
   * logged or persisted.
   */
  token?: string
  /** Human-readable reason when degraded or stopped. */
  detail?: string
  /** Consecutive failed starts; drives the restart backoff. */
  restarts?: number
}

export interface IpcContract {
  'app:info': {
    /** No payload. */
    request: undefined
    response: AppInfo
  }
  'engine:state': {
    request: undefined
    response: EngineState
  }
  /** Force a restart, e.g. from a footer action. */
  'engine:restart': {
    request: undefined
    response: undefined
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
  /**
   * Write a rendered report to a temporary file and hand it to the OS.
   *
   * The bytes cross the bridge rather than a URL because the download is
   * authenticated: `shell.openExternal` on py-beacon's own URL would open a
   * browser with no bearer token and get a 401. The renderer fetches it —
   * it already holds the token — and main only writes and opens.
   */
  'report:open': {
    request: { filename: string; bytes: Uint8Array }
    response: OpenedReport
  }
}

export interface OpenedReport {
  /** Where it was written, so the pane can say so. */
  path: string
  /** Empty when the OS opened it; the reason when it refused. */
  error: string
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

/** Pushed whenever the engine's status changes, so the footer stays truthful. */
export const ENGINE_CHANGED = 'engine:changed'

/** The surface preload publishes on `window.beacon`. */
export interface BeaconBridge {
  appInfo: () => Promise<AppInfo>
  engine: {
    state: () => Promise<EngineState>
    restart: () => Promise<void>
    /** Returns an unsubscribe function. */
    onChange: (listener: (state: EngineState) => void) => () => void
  }
  window: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<boolean>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    /** Returns an unsubscribe function. */
    onMaximizeChange: (listener: (maximized: boolean) => void) => () => void
  }
  reports: {
    /** Writes the bytes to a temp file and asks the OS to open it. */
    open: (filename: string, bytes: Uint8Array) => Promise<OpenedReport>
  }
}
