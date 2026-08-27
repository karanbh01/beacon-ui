import { randomBytes } from 'node:crypto'
import {
  spawn,
  type ChildProcess,
  type ChildProcessByStdio,
  type SpawnOptionsWithStdioTuple,
  type StdioNull,
  type StdioPipe
} from 'node:child_process'
import type { Readable } from 'node:stream'
import { EventEmitter } from 'node:events'
import type { EngineState } from '@shared/ipc'
import { restartDelay, shouldGiveUp } from './backoff'
import { SERVER_MODULE, locatePython, parsePort } from './python'
import {
  environmentFor,
  readProvenance,
  readSettings,
  staleReason,
  writeProvenance,
  type StoreProvenance
} from '../dataSettings'
import {
  generateArgs,
  generateSynthetic,
  readStoreStatus,
  removeStore,
  shouldGenerate
} from './synthetic'

/** How often to confirm the server is still answering. */
const HEALTH_INTERVAL_MS = 4_000

/** A start that never announces a port is treated as failed. */
const START_TIMEOUT_MS = 30_000

const HEALTH_TIMEOUT_MS = 2_500

export interface HealthResponse {
  status: string
  version: string
}

function sameState(a: EngineState, b: EngineState): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (a[key as keyof EngineState] !== b[key as keyof EngineState]) return false
  }
  return true
}

/**
 * Turn a child exit into something a human can read.
 *
 * Windows reports a force-kill as 4294967295 (0xFFFFFFFF), which in a footer
 * tooltip looks like a bug in us rather than a killed process.
 */
export function describeExit(code: number | null, signal: string | null): string {
  if (code === 2) return 'server rejected its configuration'
  if (signal !== null) return `server was killed (${signal})`
  if (code === null || code < 0 || code > 255) return 'server terminated unexpectedly'
  if (code === 0) return 'server exited cleanly'
  return `server exited with code ${String(code)}`
}

export interface EngineOptions {
  /** Connect to an already-running server instead of spawning one. */
  serverUrl?: string | undefined
  /** Pin the interpreter. */
  pythonPath?: string | undefined
  appRoot?: string
  /**
   * `extraResources` directory, set only when the app is packaged.
   *
   * Its presence is what makes the bundled interpreter win (ADR-0003) — in
   * development there is no payload, and the sibling py-beacon checkout is
   * the interpreter that should be used.
   */
  resourcesPath?: string | undefined
  /** Injected in tests. */
  fetchImpl?: typeof fetch
  /**
   * Injected in tests, for the same reason `fetchImpl` is: the alternative is
   * a test that really launches python, and one that gets the lifecycle wrong
   * then leaves a server running on the machine that ran it.
   *
   * The one overload this class uses, rather than all of `spawn`: stdin
   * ignored, stdout and stderr piped — which is what makes `stdout` non-null
   * and the announced port readable.
   */
  spawnImpl?: (
    command: string,
    args: readonly string[],
    options: SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioPipe>
  ) => ChildProcessByStdio<null, Readable, Readable>
}

/**
 * Supervises the py-beacon process: spawn, health-poll, restart, kill.
 *
 * Owns the single source of truth for engine state. The footer renders
 * whatever this reports and never infers — if the server is unreachable the
 * UI has to say so rather than look healthy.
 */
export class Engine extends EventEmitter {
  private state: EngineState = { status: 'idle' }
  private child: ChildProcess | null = null
  private healthTimer: NodeJS.Timeout | undefined
  private restartTimer: NodeJS.Timeout | undefined
  private startTimer: NodeJS.Timeout | undefined
  private attempt = 0
  private stopping = false
  /** True from the first `start()` until `stop()`. Guards a second launch. */
  private launched = false
  /** True while `regenerate` owns the lifecycle, so nothing else spawns. */
  private rebuilding = false
  /** Written this session, waiting for a server to say which version wrote it. */
  private unstamped: StoreProvenance | undefined
  private readonly token: string
  private readonly options: EngineOptions

  constructor(options: EngineOptions = {}) {
    super()
    this.options = options
    // 32 bytes of entropy. The server rejects an empty token and this never
    // leaves the machine, but a guessable one would let any local process
    // drive the engine.
    this.token = randomBytes(32).toString('hex')
  }

  getState(): EngineState {
    return this.state
  }

  /**
   * Merge a patch into the state and publish it.
   *
   * `undefined` means "clear this field", not "leave it alone". Under
   * exactOptionalPropertyTypes a plain spread cannot express that, and the
   * distinction matters: a stale `detail` surviving a successful reconnect
   * would leave the footer explaining a failure that is over.
   */
  private setState(next: { [K in keyof EngineState]?: EngineState[K] | undefined }): void {
    const entries = Object.entries({ ...this.state, ...next }).filter(
      ([, value]) => value !== undefined
    )
    const merged = Object.fromEntries(entries) as unknown as EngineState

    // Only publish real changes. A health poll every 4s that reports the same
    // thing is not a change — emitting anyway would re-render the renderer on
    // a timer forever and bury genuine transitions in the log.
    if (sameState(this.state, merged)) return

    this.state = merged
    this.emit('change', this.state)
  }

  /**
   * Start supervising.
   *
   * Called when the splash's Start is pressed, not at app launch (BU-115):
   * generating a store is minutes of work, and the settings that decide where
   * it lands sit on the same window. Doing it before the user has said go
   * meant the one moment those settings are cheap to change had already
   * passed.
   *
   * Idempotent, because Start is a button and buttons get pressed twice. A
   * second call while a store is being generated would run a second generator
   * over the same directory.
   *
   * With BEACON_SERVER_URL set we attach to an externally-run server and
   * never spawn — that is the dev loop where py-beacon is being edited in
   * another terminal and restarting it from here would fight the developer.
   */
  start(): void {
    if (this.launched) return
    this.launched = true

    // A rebuild is already holding the lifecycle and will spawn when it is
    // done — it now knows the app has been asked for. Spawning here would
    // race the generator it is running.
    if (this.rebuilding) return

    this.stopping = false
    const external = this.options.serverUrl
    if (external !== undefined && external !== '') {
      this.setState({
        status: 'starting',
        baseUrl: external.replace(/\/$/, ''),
        token: this.token,
        detail: 'attached to BEACON_SERVER_URL'
      })
      this.beginHealthPolling()
      return
    }
    void this.prepareData().then(() => {
      if (!this.stopping) this.spawnServer()
    })
  }

  /**
   * Give the server something to serve, if nothing else has (BU-57).
   *
   * py-beacon auto-loads a store from its app-data directory, so generating
   * one there is all it takes. Never runs when a store already exists or when
   * the user has named their own via `$BEACON_DATA_PATH` — a demo store
   * written over real data would be unforgivable, so the check is a guard
   * rather than a preference.
   *
   * Failure here is not fatal. The server still starts; it starts without
   * data, which is exactly where it was before, and says so.
   */
  private async prepareData(): Promise<void> {
    const python = this.python()

    try {
      // The saved settings, folded in: they say where the store is and
      // whether to generate one, and a real environment variable outranks
      // them (BU-111).
      const status = await readStoreStatus(python)
      if (!shouldGenerate(status, this.environment())) return

      this.setState({
        status: 'starting',
        detail: 'generating synthetic data — first run only',
        restarts: this.attempt
      })
      this.emit(
        'log',
        `generating synthetic data into ${status.path}
`
      )

      await generateSynthetic(python, {
        onLog: (line) => {
          this.emit('log', line)
        }
      })
      this.recordProvenance()
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause)
      this.emit(
        'log',
        `synthetic data unavailable: ${reason}
`
      )
    }
  }

  /**
   * Stamp what was generated, and with what (BU-89).
   *
   * Only ever written after THIS app generates a store, which is what makes
   * the marker meaningful: its presence is the difference between "we made
   * this and may replace it" and "this is somebody's data, leave it".
   *
   * The version has to wait. Generation runs before the server is up, and
   * /health is the only thing that reports py-beacon's version — asking
   * python separately would be a second answer that could disagree with the
   * one the footer shows. So the marker lands now, dated and with its
   * arguments, and `stampVersion` fills the version on the first connect.
   */
  private recordProvenance(): void {
    const provenance: StoreProvenance = {
      engineVersion: '',
      args: generateArgs(),
      generatedAt: new Date().toISOString()
    }
    writeProvenance(provenance)
    this.unstamped = provenance
  }

  /** Finish a marker this session left waiting for a version. */
  private stampVersion(version: string): void {
    const pending = this.unstamped
    if (pending === undefined) return
    this.unstamped = undefined
    writeProvenance({ ...pending, engineVersion: version })
  }

  /**
   * Whether the store is behind what this build would generate (BU-89).
   *
   * Only ever an opinion about a store this app wrote. No marker means the
   * store is not ours, and `BEACON_DATA_PATH` means the user has named it
   * theirs — in both cases there is nothing to offer and nothing to say.
   */
  private staleness(version: string): string | undefined {
    if ((this.environment().BEACON_DATA_PATH ?? '').trim() !== '') return undefined
    return staleReason(readProvenance(), version, generateArgs())
  }

  /** The real environment with the saved data settings folded in (BU-111). */
  private environment(): NodeJS.ProcessEnv {
    return environmentFor(readSettings(), process.env)
  }

  private python(): string {
    return locatePython({
      override: this.options.pythonPath,
      ...(this.options.appRoot === undefined ? {} : { appRoot: this.options.appRoot }),
      ...(this.options.resourcesPath === undefined
        ? {}
        : { resourcesPath: this.options.resourcesPath })
    })
  }

  private spawnServer(): void {
    const python = this.python()

    this.setState({ status: 'starting', detail: undefined, restarts: this.attempt })

    const launch = this.options.spawnImpl ?? spawn
    const child = launch(python, ['-m', SERVER_MODULE, '--port', '0'], {
      env: { ...this.environment(), BEACON_API_TOKEN: this.token, PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.child = child

    let announced = false
    const onStdout = (chunk: Buffer): void => {
      const text = chunk.toString('utf-8')
      if (announced) return
      const port = parsePort(text)
      if (port === undefined) return
      announced = true
      this.clearStartTimer()
      this.setState({ baseUrl: `http://127.0.0.1:${String(port)}`, token: this.token })
      this.beginHealthPolling()
    }

    child.stdout.on('data', onStdout)
    // Kept for diagnostics only. The port never comes this way, but a failed
    // start usually explains itself here.
    child.stderr.on('data', (chunk: Buffer) => {
      this.emit('log', chunk.toString('utf-8'))
    })

    child.on('exit', (code, signal) => {
      if (this.stopping) return
      this.child = null
      this.stopHealthPolling()
      this.fail(describeExit(code, signal))
    })

    child.on('error', (error: Error) => {
      if (this.stopping) return
      this.child = null
      this.fail(`could not launch python: ${error.message}`)
    })

    this.startTimer = setTimeout(() => {
      if (announced || this.stopping) return
      this.fail('server did not announce a port')
    }, START_TIMEOUT_MS)
  }

  private clearStartTimer(): void {
    if (this.startTimer !== undefined) clearTimeout(this.startTimer)
    this.startTimer = undefined
  }

  private beginHealthPolling(): void {
    this.stopHealthPolling()
    void this.checkHealth()
    this.healthTimer = setInterval(() => {
      void this.checkHealth()
    }, HEALTH_INTERVAL_MS)
  }

  private stopHealthPolling(): void {
    if (this.healthTimer !== undefined) clearInterval(this.healthTimer)
    this.healthTimer = undefined
  }

  private async checkHealth(): Promise<void> {
    const base = this.state.baseUrl
    if (base === undefined) return

    const doFetch = this.options.fetchImpl ?? fetch
    try {
      const response = await doFetch(`${base}/health`, {
        // /health sits inside the guarded router — without this it is a 401
        // and the engine would look permanently dead while running fine.
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)
      })
      if (!response.ok) {
        this.fail(`health check returned ${String(response.status)}`)
        return
      }
      const body = (await response.json()) as HealthResponse
      this.attempt = 0

      // Reading the marker is a file read, so it happens on the transition
      // rather than on every four-second poll that reports the same thing.
      const settled = this.state.status === 'connected' && this.state.version === body.version
      if (!settled) this.stampVersion(body.version)

      this.setState({
        status: 'connected',
        version: body.version,
        detail: undefined,
        restarts: 0,
        ...(settled ? {} : { stale: this.staleness(body.version) })
      })
    } catch {
      this.fail('health check did not respond')
    }
  }

  /** Move to degraded and schedule a restart, or give up. */
  private fail(detail: string): void {
    if (this.stopping) return
    this.stopHealthPolling()
    this.clearStartTimer()
    this.killChild()

    if (shouldGiveUp(this.attempt)) {
      this.setState({ status: 'stopped', detail, restarts: this.attempt })
      return
    }

    const delay = restartDelay(this.attempt)
    this.attempt += 1
    this.setState({ status: 'degraded', detail, restarts: this.attempt })

    // An attached external server is not ours to restart; keep polling and
    // let it come back on its own.
    const external = this.options.serverUrl
    if (external !== undefined && external !== '') {
      this.restartTimer = setTimeout(() => {
        this.beginHealthPolling()
      }, delay)
      return
    }

    this.restartTimer = setTimeout(() => {
      this.spawnServer()
    }, delay)
  }

  /** Explicit restart, e.g. from the UI. Resets the backoff. */
  /**
   * Throw the demo store away and build a new one (BU-107).
   *
   * The opposite of `prepareData`, which refuses to touch an existing store —
   * that guard protects someone who has real data at the app-data path, and
   * it stays. This is the explicit override: the user asked, in the app, for
   * this store to be replaced.
   *
   * `BEACON_DATA_PATH` still refuses. Naming a source is the strongest signal
   * that the data is the user's rather than ours, and no button should
   * overwrite it — the caller confirms with the user, not with the engine.
   */
  async regenerate(): Promise<void> {
    if ((this.environment().BEACON_DATA_PATH ?? '').trim() !== '') {
      throw new Error('BEACON_DATA_PATH names your own data store, so this will not replace it.')
    }

    const python = this.python()

    // Down first: the server holds the files open, and on Windows a delete
    // under an open handle fails rather than waiting.
    this.clearTimers()
    this.killChild()
    this.setState({ status: 'starting', detail: 'replacing the data store', restarts: 0 })

    // The lifecycle is ours until this finishes; `start` defers to it rather
    // than spawning a second server alongside the one below.
    this.rebuilding = true

    try {
      const removed = await removeStore(python)
      this.emit(
        'log',
        `${removed ? 'removed the existing data store' : 'no store to remove'}
`
      )

      this.setState({ status: 'starting', detail: 'generating synthetic data', restarts: 0 })
      await generateSynthetic(python, {
        onLog: (line) => {
          this.emit('log', line)
        }
      })
      this.recordProvenance()
    } finally {
      this.rebuilding = false
      this.attempt = 0
      this.stopping = false

      /*
       * Only start what has been asked for.
       *
       * Replacing the store from the splash's data settings is a request to
       * rebuild the data, not to launch the app — Start is what does that
       * (BU-115). Read at the END rather than the beginning, because Start
       * may well have been pressed during the couple of minutes this takes,
       * and then the app is owed the engine it asked for.
       *
       * A running engine is owed one back either way: a failed generation
       * leaves the server startable, just with less to serve.
       */
      if (this.launched) {
        this.spawnServer()
      } else {
        // Back to untouched: a new store, and nothing running to serve it.
        // A stale baseUrl would point at the server just killed.
        this.setState({
          status: 'idle',
          detail: undefined,
          baseUrl: undefined,
          token: undefined,
          restarts: 0
        })
      }
    }
  }

  restart(): void {
    // Nothing to restart before Start has been pressed, and starting here
    // would defeat it — saving data settings on the splash calls this.
    if (!this.launched) return

    this.clearTimers()
    this.attempt = 0
    this.killChild()
    this.launched = false
    this.start()
  }

  private killChild(): void {
    const child = this.child
    this.child = null
    if (child?.exitCode !== null) return
    child.kill()
  }

  private clearTimers(): void {
    this.stopHealthPolling()
    this.clearStartTimer()
    if (this.restartTimer !== undefined) clearTimeout(this.restartTimer)
    this.restartTimer = undefined
  }

  /** Called on app quit. Must leave no orphaned python behind. */
  stop(): void {
    this.stopping = true
    this.launched = false
    this.clearTimers()
    this.killChild()
    this.state = { status: 'stopped' }
  }
}
