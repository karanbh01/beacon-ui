import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineState } from '@shared/ipc'

const userData = mkdtempSync(join(tmpdir(), 'beacon-saved-store-'))

vi.mock('electron', () => ({ app: { getPath: () => userData } }))

const { handOverOnConnect, handOverSavedStore } = await import('./savedStore')

/**
 * Handing a store location an older build saved to the engine (BU-215).
 *
 * The old model passed it as BEACON_DATA_PATH, which outranks the engine's
 * registry on every start. Carried on, it would pin the engine to that
 * folder for good, and Use in the sources dialog would undo itself at the
 * next launch.
 */

interface Call {
  method: string
  route: string
  body?: unknown
}

/** An engine answering each route as told, recording what was asked. */
function engineAnswering(answers: Record<string, { status: number; body?: unknown }>) {
  const calls: Call[] = []
  const fetchImpl = ((url: string, init: RequestInit = {}) => {
    const route = url.replace('http://engine', '')
    const method = init.method ?? 'GET'
    calls.push({
      method,
      route,
      ...(typeof init.body === 'string' ? { body: JSON.parse(init.body) as unknown } : {})
    })
    const answer = answers[`${method} ${route}`] ?? { status: 500 }
    return Promise.resolve({
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: () => Promise.resolve(answer.body)
    })
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

const connection = { baseUrl: 'http://engine', token: 't' }

describe('handing over a saved store', () => {
  it('registers the folder under its own name, then serves it', async () => {
    const engine = engineAnswering({
      'POST /data/stores': { status: 201, body: { id: 'prices-1' } },
      'POST /data/stores/prices-1/activate': { status: 202 }
    })

    const outcome = await handOverSavedStore('D:\\research\\prices', {
      ...connection,
      fetchImpl: engine.fetchImpl
    })

    expect(outcome).toBe('served')
    expect(engine.calls[0]?.body).toEqual({
      kind: 'folder',
      name: 'prices',
      path: 'D:\\research\\prices'
    })
  })

  it('serves the store the engine already has for that folder', async () => {
    // A launch that registered it and was closed before activating: 409 on
    // the retry, and the existing store is the one to serve, found by path
    // however the two spellings differ.
    const engine = engineAnswering({
      'POST /data/stores': { status: 409 },
      'GET /data/stores': {
        status: 200,
        body: {
          stores: [
            { id: 'other', path: 'D:/x' },
            { id: 'mine', path: 'd:/research/prices' }
          ]
        }
      },
      'POST /data/stores/mine/activate': { status: 202 }
    })

    const outcome = await handOverSavedStore('D:\\Research\\Prices\\', {
      ...connection,
      fetchImpl: engine.fetchImpl
    })

    expect(outcome).toBe('served')
    expect(engine.calls.at(-1)?.route).toBe('/data/stores/mine/activate')
  })

  it('gives up on a folder the engine says is not a store', async () => {
    const engine = engineAnswering({ 'POST /data/stores': { status: 422 } })

    const outcome = await handOverSavedStore('D:/empty', {
      ...connection,
      fetchImpl: engine.fetchImpl
    })

    expect(outcome).toBe('not-a-store')
    expect(engine.calls).toHaveLength(1)
  })

  it('reports a failure when the engine will not load it now', async () => {
    // 409 on activate: another load is running. Worth another try later.
    const engine = engineAnswering({
      'POST /data/stores': { status: 201, body: { id: 'prices-1' } },
      'POST /data/stores/prices-1/activate': { status: 409 }
    })

    const outcome = await handOverSavedStore('D:/prices', {
      ...connection,
      fetchImpl: engine.fetchImpl
    })
    expect(outcome).toBe('failed')
  })
})

describe('when the handover happens', () => {
  const settingsFile = join(userData, 'data-settings.json')
  const connected: EngineState = { status: 'connected', baseUrl: 'http://engine', token: 't' }

  beforeEach(() => {
    writeFileSync(settingsFile, JSON.stringify({ storePath: 'D:/prices', synthetic: true }))
  })

  /** Connect once, and wait for whatever the handover does to finish. */
  async function connectWith(
    engine: ReturnType<typeof engineAnswering>,
    env: NodeJS.ProcessEnv = {}
  ): Promise<void> {
    const done = new Promise<void>((resolve) => {
      handOverOnConnect(
        (listener) => {
          listener(connected)
          // A second connect in the same launch must not repeat it.
          listener(connected)
        },
        () => {
          resolve()
        },
        { env, fetchImpl: engine.fetchImpl }
      )
      if (engine.calls.length === 0) setTimeout(resolve, 20)
    })
    await done
  }

  it('forgets the saved location once the engine is serving it', async () => {
    const engine = engineAnswering({
      'POST /data/stores': { status: 201, body: { id: 'p' } },
      'POST /data/stores/p/activate': { status: 202 }
    })
    await connectWith(engine)

    expect(
      engine.calls.filter((call) => call.method === 'POST' && call.route === '/data/stores')
    ).toHaveLength(1)
    expect(existsSync(settingsFile)).toBe(false)
  })

  it('keeps it after a failure, to try again next launch', async () => {
    const engine = engineAnswering({})
    await connectWith(engine)
    expect(existsSync(settingsFile)).toBe(true)
  })

  it('leaves everything alone while BEACON_DATA_PATH names the data', async () => {
    // Whoever set it chose what the engine serves; this must not overrule it.
    const engine = engineAnswering({})
    await connectWith(engine, { BEACON_DATA_PATH: 'E:/typed' })
    expect(engine.calls).toHaveLength(0)
    expect(existsSync(settingsFile)).toBe(true)
  })
})
