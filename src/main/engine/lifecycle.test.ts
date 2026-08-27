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

let generation: { resolve: () => void; promise: Promise<void> }

vi.mock('./synthetic', () => ({
  SYNTHETIC_MODULE: 'beacon.synthetic',
  generateArgs: () => ['-m', 'beacon.synthetic', '--seed', '42'],
  generateSynthetic: () => generation.promise,
  readStoreStatus: () => Promise.resolve({ path: 'C:/store', exists: true }),
  removeStore: () => Promise.resolve(true),
  shouldGenerate: () => false
}))

const { Engine } = await import('./engine')

beforeEach(() => {
  spawn.mockClear()
  let resolve = (): void => undefined
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  generation = { resolve, promise }
})

/**
 * Who is allowed to start python, and when (BU-115, BU-116).
 *
 * All of this is about not running two of it. Generating a store is minutes
 * of work against one directory, and a second generator or a second server is
 * not a slow app, it is a corrupt one.
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

  it('leaves the engine idle after a rebuild nobody was waiting for', async () => {
    // Replacing the data from the splash's settings is a request to rebuild
    // the store, not to launch the app.
    const engine = new Engine({ spawnImpl: spawn })
    const rebuilt = engine.regenerate()
    generation.resolve()
    await rebuilt

    expect(spawn).not.toHaveBeenCalled()
    expect(engine.getState().status).toBe('idle')
    // Nothing left pointing at the server it killed.
    expect(engine.getState().baseUrl).toBeUndefined()
  })

  it('still hands back an engine when Start lands mid-rebuild', async () => {
    const engine = new Engine({ spawnImpl: spawn })
    const rebuilt = engine.regenerate()

    // A couple of minutes is long enough for someone to press Start, and the
    // rebuild is holding the lifecycle — so it has to spawn on their behalf.
    engine.start()
    expect(spawn).not.toHaveBeenCalled()

    generation.resolve()
    await rebuilt

    expect(spawn).toHaveBeenCalledTimes(1)
    expect(engine.getState().status).toBe('starting')
    engine.stop()
  })

  it('refuses to replace a store the user named', async () => {
    vi.stubEnv('BEACON_DATA_PATH', 'D:/mine')
    const engine = new Engine({ spawnImpl: spawn })

    await expect(engine.regenerate()).rejects.toThrow(/BEACON_DATA_PATH/)
    expect(spawn).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
