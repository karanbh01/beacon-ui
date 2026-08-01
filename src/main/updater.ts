import { EventEmitter } from 'node:events'
import type { UpdateState } from '@shared/ipc'

/** Long enough after launch that it never competes with the engine starting. */
const FIRST_CHECK_MS = 15_000

/** And how often after that. Four times a day is more than enough. */
const INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * The slice of electron-updater's `autoUpdater` this needs.
 *
 * Narrow on purpose. It keeps `Updater` unit-testable against a fake with no
 * Electron in the process, and the real `autoUpdater` is still checked
 * against it structurally at the one place it is handed over
 * (`src/main/index.ts`) — so this cannot drift from the library without a
 * compile error. Widening it is how a test starts passing against behaviour
 * the library does not have.
 */
export interface UpdateFeed {
  autoDownload: boolean
  on(event: 'checking-for-update', listener: () => void): unknown
  on(
    event: 'update-available' | 'update-not-available' | 'update-downloaded',
    listener: (info: { version: string }) => void
  ): unknown
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
}

export function sameUpdate(a: UpdateState, b: UpdateState): boolean {
  return (
    a.status === b.status &&
    a.version === b.version &&
    a.percent === b.percent &&
    a.detail === b.detail
  )
}

/** `exactOptionalPropertyTypes` will not take an explicit `undefined`. */
function withVersion(state: UpdateState, version: string | undefined): UpdateState {
  return version === undefined ? state : { ...state, version }
}

/**
 * Update lifecycle over electron-updater (BU-34, ADR-0004).
 *
 * Constructed without a feed in development and in tests of the surrounding
 * wiring, where there is genuinely nothing to check against: every action is
 * then a no-op and the status stays `idle`, so the footer shows nothing
 * rather than an error the user cannot act on.
 */
export class Updater extends EventEmitter {
  private state: UpdateState = { status: 'idle' }
  private timer: NodeJS.Timeout | undefined
  private readonly feed: UpdateFeed | undefined

  /** Whether whatever is in flight was asked for, rather than timed. */
  private userInitiated = false

  constructor(feed?: UpdateFeed) {
    super()
    this.feed = feed
    if (feed === undefined) return

    // Never download unasked. Every update is a whole new installer with its
    // own CPython inside — 159 MB measured — and pulling that in the
    // background would be rude on a metered connection and invisible while
    // it happened. See ADR-0004.
    feed.autoDownload = false
    this.subscribe(feed)
  }

  getState(): UpdateState {
    return this.state
  }

  /** Begin background checks. Separate from the constructor so tests can opt out. */
  start(firstCheckMs = FIRST_CHECK_MS, intervalMs = INTERVAL_MS): void {
    if (this.feed === undefined) return
    this.timer = setTimeout(() => {
      this.check('auto')
      this.timer = setInterval(() => {
        this.check('auto')
      }, intervalMs)
    }, firstCheckMs)
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
  }

  check(source: 'user' | 'auto' = 'user'): void {
    if (this.feed === undefined) return
    // A check mid-download would restart the state machine underneath it.
    if (this.state.status === 'downloading' || this.state.status === 'ready') return

    this.userInitiated = source === 'user'
    this.set({ status: 'checking' })
    // The rejection duplicates the `error` event, which is the one that
    // carries the state transition.
    void this.feed.checkForUpdates().catch(() => undefined)
  }

  download(): void {
    if (this.feed === undefined || this.state.status !== 'available') return

    this.userInitiated = true
    this.set(withVersion({ status: 'downloading', percent: 0 }, this.state.version))
    void this.feed.downloadUpdate().catch(() => undefined)
  }

  /**
   * Quit and install what was downloaded.
   *
   * Guarded on `ready` because `quitAndInstall` with nothing staged quits the
   * app and does not bring it back — the user would just see Beacon vanish.
   */
  install(): void {
    if (this.feed === undefined || this.state.status !== 'ready') return
    this.feed.quitAndInstall()
  }

  private subscribe(feed: UpdateFeed): void {
    feed.on('checking-for-update', () => {
      this.set({ status: 'checking' })
    })
    feed.on('update-available', (info) => {
      this.set({ status: 'available', version: info.version })
    })
    feed.on('update-not-available', () => {
      this.set({ status: 'idle' })
    })
    feed.on('download-progress', (progress) => {
      const percent = Math.min(100, Math.max(0, Math.round(progress.percent)))
      this.set(withVersion({ status: 'downloading', percent }, this.state.version))
    })
    feed.on('update-downloaded', (info) => {
      this.set({ status: 'ready', version: info.version })
    })
    feed.on('error', (error) => {
      this.fail(error)
    })
  }

  private fail(error: unknown): void {
    const detail = error instanceof Error ? error.message : 'could not check for updates'
    this.emit('log', detail)

    // Offline is the common case and there is nothing for the user to do
    // about it, so a check they did not ask for fails quietly.
    if (!this.userInitiated) {
      this.set({ status: 'idle' })
      return
    }
    this.set({ status: 'error', detail })
  }

  private set(next: UpdateState): void {
    if (sameUpdate(this.state, next)) return
    this.state = next
    this.emit('change', next)
  }
}
