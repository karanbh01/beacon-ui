import { randomBytes } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { EngineState } from '@shared/ipc'
import { restartDelay, shouldGiveUp } from './backoff'
import { SERVER_MODULE, locatePython, parsePort } from './python'
import { generateSynthetic, readStoreStatus, shouldGenerate } from './synthetic'

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
}

/**
 * Supervises the py-beacon process: spawn, health-poll, restart, kill.
 *
 * Owns the single source of truth for engine state. The footer renders
 * whatever this reports and never infers — if the server is unreachable the
 * UI has to say so rather than look healthy.
 */
export class Engine extends EventEmitter {
  private state: EngineState = { status: 'starting' }
  private child: ChildProcess | null = null
  private healthTimer: NodeJS.Timeout | undefined
  private restartTimer: NodeJS.Timeout | undefined
  private startTimer: NodeJS.Timeout | undefined
  private attempt = 0
  private stopping = false
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
   * With BEACON_SERVER_URL set we attach to an externally-run server and
   * never spawn — that is the dev loop where py-beacon is being edited in
   * another terminal and restarting it from here would fight the developer.
   */
  start(): void {
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
      const status = await readStoreStatus(python)
      if (!shouldGenerate(status, process.env)) return

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
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause)
      this.emit(
        'log',
        `synthetic data unavailable: ${reason}
`
      )
    }
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

    const child = spawn(python, ['-m', SERVER_MODULE, '--port', '0'], {
      env: { ...process.env, BEACON_API_TOKEN: this.token, PYTHONUNBUFFERED: '1' },
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
      this.setState({
        status: 'connected',
        version: body.version,
        detail: undefined,
        restarts: 0
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
  restart(): void {
    this.clearTimers()
    this.attempt = 0
    this.killChild()
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
    this.clearTimers()
    this.killChild()
    this.state = { status: 'stopped' }
  }
}
