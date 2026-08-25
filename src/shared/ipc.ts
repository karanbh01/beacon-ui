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
  /**
   * Why the store this app generated is behind what it would generate now
   * (BU-89), in words a person can read. Absent when there is nothing to say
   * — and always absent for a store this app did not write, which it has no
   * standing to judge.
   */
  stale?: string
}

/**
 * Lifecycle of an update check (BU-34).
 *
 * `idle` is both "never checked" and "up to date": neither is worth saying in
 * a footer. Nothing downloads without being asked, so `available` and
 * `downloading` are distinct states rather than one — see ADR-0004.
 */
export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

export interface UpdateState {
  status: UpdateStatus
  /** The version on offer, once one is known. */
  version?: string
  /** 0–100 while downloading. */
  percent?: number
  /**
   * Why it failed. Only ever set for a check the user asked for: a background
   * check that fails is usually just "offline", and nagging about it forever
   * is noise the user cannot act on.
   */
  detail?: string
}

/**
 * A file the renderer wants written to disk (BU-106).
 *
 * The BYTES are the renderer's: it holds the rows, and a CSV or a workbook is
 * a pure function of them. Only the save dialog and the write need main, so
 * that is all that crosses.
 */
export interface RegenerateResult {
  /** False when the user cancelled the confirmation, which is not an error. */
  started: boolean
  /** Why it could not run — `BEACON_DATA_PATH`, or a failure part way. */
  problem?: string
}

/**
 * How the engine should find its data (BU-111).
 *
 * These are the two environment variables `shouldGenerate` already reads,
 * made settable from inside the app for anyone who never opens a terminal.
 * A real environment variable still wins — see `environmentFor`.
 */
export interface DataSettings {
  /** Empty means py-beacon's own app-data location. */
  storePath: string
  /** Generate a synthetic store when there is nothing at that location. */
  synthetic: boolean
}

export interface SaveRequest {
  /** Offered in the dialog, and the basis for the extension filter. */
  suggestedName: string
  /** 'csv' or 'xlsx' — picks the dialog's filter and nothing else. */
  format: 'csv' | 'xlsx'
  /** The whole file. Base64 because the bridge is a structured clone away. */
  base64: string
}

export interface SaveResult {
  /** False when the user dismissed the dialog, which is not an error. */
  saved: boolean
  path?: string
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
  /**
   * Throw the demo store away and build a new one (BU-107).
   *
   * Confirms with the user in main before destroying anything, so the answer
   * says whether it actually ran rather than assuming it did.
   */
  'engine:regenerate': {
    request: undefined
    response: RegenerateResult
  }
  'update:state': {
    request: undefined
    response: UpdateState
  }
  /** Check now, on the user's initiative rather than the timer's. */
  'update:check': {
    request: undefined
    response: undefined
  }
  'update:download': {
    request: undefined
    response: undefined
  }
  /** Quits and installs. Ignored unless a download has finished. */
  'update:install': {
    request: undefined
    response: undefined
  }
  /**
   * The splash reporting that startup finished.
   *
   * Sent by the splash window rather than decided in main, because the thing
   * that knows the engine is ready is the same code drawing the bar — and
   * main deciding separately would let the two disagree about when to hand
   * over.
   */
  'window:splashDone': {
    request: undefined
    response: undefined
  }
  /** Ask where to put a file the renderer has already built, then write it. */
  'file:save': {
    request: SaveRequest
    response: SaveResult
  }
  /**
   * Open a URL in the user's browser (BU-112).
   *
   * Main refuses anything but http(s), because the renderer is the least
   * trusted place in the app to be handing `shell.openExternal` a string —
   * `file:` and the OS's own schemes are how that call becomes a way to run
   * things.
   */
  'data:settings': {
    request: undefined
    response: DataSettings
  }
  /**
   * Save them and restart the engine against the result.
   *
   * Answers with what was stored, since the engine may have been pointed at
   * a location that turns out to hold nothing.
   */
  'data:saveSettings': {
    request: DataSettings
    response: DataSettings
  }
  /** Ask the user for a folder. Empty when they dismissed the dialog. */
  'data:chooseStore': {
    request: undefined
    response: { path: string }
  }
  /** The splash opening its settings window, and that window closing itself. */
  'window:openSettings': {
    request: undefined
    response: undefined
  }
  'window:closeSettings': {
    request: undefined
    response: undefined
  }
  'shell:openExternal': {
    request: { url: string }
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

/** Pushed on every update transition, including each download progress tick. */
export const UPDATE_CHANGED = 'update:changed'

/** The surface preload publishes on `window.beacon`. */
export interface BeaconBridge {
  appInfo: () => Promise<AppInfo>
  engine: {
    state: () => Promise<EngineState>
    restart: () => Promise<void>
    /** Replaces the synthetic store. Asks first. */
    regenerate: () => Promise<RegenerateResult>
    /** Returns an unsubscribe function. */
    onChange: (listener: (state: EngineState) => void) => () => void
  }
  update: {
    state: () => Promise<UpdateState>
    check: () => Promise<void>
    download: () => Promise<void>
    install: () => Promise<void>
    /** Returns an unsubscribe function. */
    onChange: (listener: (state: UpdateState) => void) => () => void
  }
  window: {
    /** Splash only: startup is complete, show the app. */
    splashDone: () => Promise<void>
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
  files: {
    /** Asks where to put a file the renderer built, then writes it. */
    save: (request: SaveRequest) => Promise<SaveResult>
  }
  shell: {
    /** Opens an http(s) URL in the default browser. */
    openExternal: (url: string) => Promise<void>
  }
  data: {
    settings: () => Promise<DataSettings>
    saveSettings: (settings: DataSettings) => Promise<DataSettings>
    chooseStore: () => Promise<{ path: string }>
    openSettingsWindow: () => Promise<void>
    closeSettingsWindow: () => Promise<void>
  }
}
