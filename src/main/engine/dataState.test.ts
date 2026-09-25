import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const userData = mkdtempSync(join(tmpdir(), 'beacon-data-state-'))

vi.mock('electron', () => ({ app: { getPath: () => userData } }))

const { Engine } = await import('./engine')

/**
 * What data the engine is serving, carried on the engine state (BU-215).
 *
 * Read from the /health poll main already runs to supervise the engine, so
 * the footer can go red when nothing is loaded and the renderer can notice
 * data that changed while its event socket was down — with no new polling.
 */

type Health = Record<string, unknown>

/** A server whose /health answer the test can change between polls. */
function answering(answers: Health[]): typeof fetch {
  let at = 0
  return (() => {
    const body = answers[Math.min(at, answers.length - 1)]
    at += 1
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
  }) as unknown as typeof fetch
}

const serving = (store: string, version: string): Health => ({
  status: 'ok',
  version: '0.1.2',
  data_source: {
    configured: true,
    loading: false,
    store_id: 'syn',
    store_name: store,
    data_version: version,
    identifiers: 6000
  }
})

const nothing = (version: string): Health => ({
  status: 'ok',
  version: '0.1.2',
  data_source: {
    configured: false,
    loading: false,
    store_id: null,
    store_name: null,
    data_version: version,
    identifiers: 0
  }
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Start, then let `polls` health checks answer. */
async function engineAfter(answers: Health[], polls: number) {
  const engine = new Engine({ serverUrl: 'http://127.0.0.1:1', fetchImpl: answering(answers) })
  engine.start()
  await vi.advanceTimersByTimeAsync(0)
  for (let poll = 1; poll < polls; poll++) await vi.advanceTimersByTimeAsync(4_000)
  return engine
}

describe('the data the engine is serving', () => {
  it('carries what the engine reports', async () => {
    const engine = await engineAfter([serving('Synthetic data', 'a1')], 1)
    expect(engine.getState()).toMatchObject({
      dataLoaded: true,
      dataLoading: false,
      dataStore: 'Synthetic data',
      dataVersion: 'a1'
    })
    engine.stop()
  })

  it('says so when the engine is running with nothing loaded', async () => {
    const engine = await engineAfter([nothing('b2')], 1)
    expect(engine.getState().dataLoaded).toBe(false)
    engine.stop()
  })

  it('forgets a store name once that store is no longer served', async () => {
    /*
     * The bug this was written to catch. `setState` merges over the old
     * state, so a field left OUT keeps its previous value: the name of a
     * store unloaded a minute ago went on showing. Clearing needs the key
     * present and undefined.
     */
    const engine = await engineAfter([serving('Synthetic data', 'a1'), nothing('b2')], 2)
    expect(engine.getState().dataStore).toBeUndefined()
    expect(engine.getState().dataLoaded).toBe(false)
    engine.stop()
  })

  it('follows the token as the data changes', async () => {
    const engine = await engineAfter(
      [serving('Synthetic data', 'a1'), serving('Imported', 'c3')],
      2
    )
    expect(engine.getState().dataVersion).toBe('c3')
    engine.stop()
  })

  it('leaves the fields absent for an engine that does not publish them', async () => {
    /*
     * Before py-beacon 0.1.2 there is no data source on /health. Absent must
     * stay absent: reading it as "nothing loaded" would turn the footer red
     * against every older engine and report a version gap as missing data.
     */
    const engine = await engineAfter([{ status: 'ok', version: '0.1.0' }], 1)
    const state = engine.getState()
    expect(state.dataLoaded).toBeUndefined()
    expect(state.dataVersion).toBeUndefined()
    expect(state.status).toBe('connected')
    engine.stop()
  })
})
