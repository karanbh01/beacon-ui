import { EventEmitter } from 'node:events'
import type { ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => 'C:/tmp/beacon-lifecycle' } }))

/**
 * A child that never really launches, so nothing here spawns python.
 *
 * Cast because it is a stand-in for one: the engine only ever reads `stdout`,
 * `stderr`, `exitCode` and `kill`, and a faithful `ChildProcess` would be
 * pages of properties nothing looks at.
 */
function fakeChild(): ChildProcessByStdio<null, Readable, Readable> {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(),
    exitCode: null
  }) as unknown as ChildProcessByStdio<null, Readable, Readable>
}

const spawn = vi.fn(() => fakeChild())

const { Engine } = await import('./engine')

beforeEach(() => {
  spawn.mockClear()
})

/**
 * Who is allowed to start python, and when (BU-115).
 *
 * All of this is about not running two of it: a second server is not a slow
 * app, it is a confused one.
 */
describe('the engine lifecycle', () => {
  it('reports idle until something asks it to start', () => {
    const engine = new Engine({ spawnImpl: spawn })
    expect(engine.getState().status).toBe('idle')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('starts once, however many times Start is pressed', async () => {
    const engine = new Engine({ spawnImpl: spawn })
    engine.start()
    engine.start()
    engine.start()
    await vi.waitFor(() => {
      expect(spawn).toHaveBeenCalledTimes(1)
    })
    engine.stop()
  })

  it('spawns at once, without waiting to prepare data', () => {
    /*
     * BU-215. Start used to wait while this app generated a store, and the
     * splash sat on a stage of its own for it. The engine starts empty now
     * and generates on request, so nothing stands between Start and python.
     */
    const engine = new Engine({ spawnImpl: spawn })
    engine.start()
    expect(spawn).toHaveBeenCalledTimes(1)
    engine.stop()
  })

  it('does nothing on restart before anything was started', () => {
    const engine = new Engine({ spawnImpl: spawn })
    engine.restart()
    expect(spawn).not.toHaveBeenCalled()
    expect(engine.getState().status).toBe('idle')
  })
})

/**
 * A busy engine is not a dead one (0.2.2).
 *
 * py-beacon runs a backtest on its event loop, so /health waits behind it.
 * The supervisor killed it there, which lost the run and, on a large store,
 * looped through restarts until it gave up.
 */
describe('an engine that stops answering its health check', () => {
  const timedOut = (): Promise<Response> =>
    Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
  const healthy = (): Promise<Response> =>
    Promise.resolve(new Response(JSON.stringify({ status: 'ok', version: '0.9.4' })))

  /** Start it and announce a port: the child, and a `kill` of its own to watch. */
  function announce(engine: InstanceType<typeof Engine>): {
    child: ReturnType<typeof fakeChild>
    kill: ReturnType<typeof vi.fn>
  } {
    const kill = vi.fn()
    const child = Object.assign(fakeChild(), { kill })
    spawn.mockImplementationOnce(() => child)
    engine.start()
    child.stdout.emit('data', Buffer.from('BEACON_PORT=57020\n'))
    return { child, kill }
  }

  it('is kept running and called busy, while its process lives', async () => {
    const fetchImpl = vi.fn(healthy)
    const engine = new Engine({ spawnImpl: spawn, fetchImpl })
    const { kill } = announce(engine)
    await vi.waitFor(() => {
      expect(engine.getState().status).toBe('connected')
    })

    fetchImpl.mockImplementation(timedOut)
    await (engine as unknown as { checkHealth: () => Promise<void> }).checkHealth()

    expect(engine.getState()).toMatchObject({ status: 'connected', busy: true })
    expect(kill).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledTimes(1)

    fetchImpl.mockImplementation(healthy)
    await (engine as unknown as { checkHealth: () => Promise<void> }).checkHealth()
    expect(engine.getState().busy).toBeUndefined()
    engine.stop()
  })

  it('is still restarted when its process has gone', async () => {
    const engine = new Engine({ spawnImpl: spawn, fetchImpl: vi.fn(healthy) })
    const { child } = announce(engine)
    await vi.waitFor(() => {
      expect(engine.getState().status).toBe('connected')
    })

    child.emit('exit', 1, null)

    expect(engine.getState().status).toBe('degraded')
    engine.stop()
  })

  it('is restarted when the health check is refused rather than slow', async () => {
    const fetchImpl = vi.fn(healthy)
    const engine = new Engine({ spawnImpl: spawn, fetchImpl })
    const { kill } = announce(engine)
    await vi.waitFor(() => {
      expect(engine.getState().status).toBe('connected')
    })

    fetchImpl.mockImplementation(() => Promise.reject(new TypeError('fetch failed')))
    await (engine as unknown as { checkHealth: () => Promise<void> }).checkHealth()

    expect(engine.getState().status).toBe('degraded')
    expect(kill).toHaveBeenCalled()
    engine.stop()
  })
})
