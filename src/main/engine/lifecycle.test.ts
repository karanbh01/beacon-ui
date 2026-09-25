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
