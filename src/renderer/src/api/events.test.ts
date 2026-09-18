import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventsUrl, isTerminal, parseEvent } from './events'
import { activeJobs, useJobs } from './jobs'
import { invalidationsFor, keys } from './keys'
import { formatAge } from './useHealth'

beforeEach(() => {
  useJobs.getState().reset()
})

describe('parseEvent', () => {
  it('parses a job event', () => {
    const event = parseEvent({
      type: 'job',
      job_id: 'j1',
      kind: 'backtest',
      status: 'running',
      progress: 0.42,
      message: 'computing returns'
    })

    expect(event).toEqual({
      type: 'job',
      job_id: 'j1',
      kind: 'backtest',
      status: 'running',
      progress: 0.42,
      message: 'computing returns'
    })
  })

  it('clamps progress, so a bar cannot run past its track', () => {
    // The server clamps too, but a client that trusts the value renders
    // nonsense if it ever stops.
    expect(parseEvent({ type: 'job', job_id: 'j', status: 'running', progress: 4 })?.type).toBe(
      'job'
    )
    const over = parseEvent({ type: 'job', job_id: 'j', status: 'running', progress: 4 })
    const under = parseEvent({ type: 'job', job_id: 'j', status: 'running', progress: -1 })

    expect(over && 'progress' in over && over.progress).toBe(1)
    expect(under && 'progress' in under && under.progress).toBe(0)
  })

  it('parses a freshness event', () => {
    expect(parseEvent({ type: 'data.freshness', dataset: 'market' })).toEqual({
      type: 'data.freshness',
      dataset: 'market'
    })
  })

  it('drops malformed frames rather than throwing', () => {
    // A bad frame must not take the renderer down.
    expect(parseEvent(null)).toBeUndefined()
    expect(parseEvent('nope')).toBeUndefined()
    expect(parseEvent({ type: 'job' })).toBeUndefined()
    expect(parseEvent({ type: 'data.freshness' })).toBeUndefined()
    expect(parseEvent({ type: 'something.else' })).toBeUndefined()
  })
})

describe('terminal states', () => {
  it('treats succeeded, failed and cancelled as terminal', () => {
    expect(isTerminal('succeeded')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
    expect(isTerminal('running')).toBe(false)
    expect(isTerminal('pending')).toBe(false)
  })
})

describe('eventsUrl', () => {
  it('carries the token as a query parameter', () => {
    // A WebSocket handshake cannot set an Authorization header.
    expect(eventsUrl('http://127.0.0.1:8000', 'tok')).toBe('ws://127.0.0.1:8000/ws?token=tok')
  })

  it('upgrades https to wss', () => {
    expect(eventsUrl('https://example.test', 'tok')).toMatch(/^wss:\/\//)
  })
})

describe('job tracking', () => {
  const running = (progress: number) =>
    ({ type: 'job', job_id: 'j1', kind: 'backtest', status: 'running', progress }) as const

  it('records a job from its first event', () => {
    useJobs.getState().apply(running(0.1))
    expect(activeJobs(useJobs.getState().jobs)).toHaveLength(1)
  })

  it('never lets progress go backwards', () => {
    // Events can arrive out of order under load; a late frame must not rewind
    // a bar the user is watching.
    useJobs.getState().apply(running(0.8))
    useJobs.getState().apply(running(0.2))

    expect(useJobs.getState().jobs.j1?.progress).toBe(0.8)
  })

  it('forces a succeeded job to 100%, whatever the last frame said', () => {
    useJobs.getState().apply(running(0.7))
    useJobs.getState().apply({
      type: 'job',
      job_id: 'j1',
      kind: 'backtest',
      status: 'succeeded',
      progress: 0.7
    })

    expect(useJobs.getState().jobs.j1?.progress).toBe(1)
  })

  it('drops a finished job out of the active list', () => {
    useJobs.getState().apply(running(0.5))
    useJobs.getState().apply({
      type: 'job',
      job_id: 'j1',
      kind: 'backtest',
      status: 'succeeded',
      progress: 1
    })

    expect(activeJobs(useJobs.getState().jobs)).toHaveLength(0)
  })

  it('keeps the failure reason, with the code that says which kind it is', () => {
    /*
     * BN-199 made this the same `{code, message, detail}` envelope an HTTP
     * error carries. It was a bare string, which is why the job path was
     * the one place a deliberate refusal and a crash reached the reader
     * under the same heading.
     */
    useJobs.getState().apply({
      type: 'job',
      job_id: 'j1',
      kind: 'backtest',
      status: 'failed',
      progress: 0.3,
      error: { code: 'CALCULATION_ERROR', message: 'no data for TECH10' }
    })

    expect(useJobs.getState().jobs.j1?.error?.code).toBe('CALCULATION_ERROR')
    expect(useJobs.getState().jobs.j1?.error?.message).toBe('no data for TECH10')
  })

  it('clears settled jobs after their window, keeping running ones', () => {
    useJobs.getState().apply(running(0.5))
    useJobs.getState().apply({
      type: 'job',
      job_id: 'done',
      kind: 'sync',
      status: 'succeeded',
      progress: 1
    })

    useJobs.getState().clearSettled(1_000, Date.now() + 5_000)

    expect(useJobs.getState().jobs.done).toBeUndefined()
    expect(useJobs.getState().jobs.j1).toBeDefined()
  })
})

describe('freshness invalidation', () => {
  it('drops index views too when market data changes', () => {
    // Index numbers are computed FROM market data, so a sync makes them stale
    // even though nothing named an index.
    const invalidated = invalidationsFor('market')

    expect(invalidated).toContainEqual(keys.data.all())
    expect(invalidated).toContainEqual(keys.beacon.all())
    expect(invalidated).toContainEqual(keys.health())
  })

  it('leaves index views alone for an unrelated dataset', () => {
    expect(invalidationsFor('watchlists')).not.toContainEqual(keys.beacon.all())
  })
})

describe('query keys', () => {
  it('separates the same subject at different as-of dates', () => {
    // Sharing a cache entry would show one view the other view's numbers.
    expect(keys.beacon.weights('TECH10', '2026-07-22')).not.toEqual(
      keys.beacon.weights('TECH10', '2026-06-19')
    )
  })

  it('separates the same resource with different params', () => {
    expect(keys.data.prices('AAPL', { interval: '1d' })).not.toEqual(
      keys.data.prices('AAPL', { interval: '1wk' })
    )
  })

  it('nests under a prefix so a whole domain can be invalidated', () => {
    expect(keys.data.prices('AAPL').slice(0, 1)).toEqual(keys.data.all())
  })
})

describe('formatAge', () => {
  it('is coarse on purpose — a ticking footer draws the eye for nothing', () => {
    expect(formatAge(30)).toBe('just now')
    expect(formatAge(600)).toBe('10m ago')
    expect(formatAge(7_200)).toBe('2h ago')
    expect(formatAge(180_000)).toBe('2d ago')
  })

  it('reports nothing when there is no data source', () => {
    // cache_age is null when py-beacon has no data configured.
    expect(formatAge(null)).toBeUndefined()
    expect(formatAge(undefined)).toBeUndefined()
  })
})

describe('an event the socket cannot read (BU-204)', () => {
  /*
   * py-beacon removed an `except Exception` and two tests failed at once —
   * the swallow had kept a test double alive that never implemented the
   * contract, for as long as it had existed. The parser here can swallow the
   * same way: a job event whose shape moved is dropped, the tray never
   * updates, and there is no error, no failed request and nothing to search
   * for. Same symptom as the stub route that answered 404 behind a prefix
   * match: a control that looks deliberately switched off.
   */
  let warned: string[]

  beforeEach(() => {
    warned = []
    vi.spyOn(console, 'warn').mockImplementation((message: string) => {
      warned.push(message)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('says so when a known event is unreadable', () => {
    expect(parseEvent({ type: 'job', status: 'running' })).toBeUndefined()
    expect(warned.join(' ')).toContain('no job_id')
  })

  it('names which field was missing, since that is the whole diagnosis', () => {
    expect(parseEvent({ type: 'job', job_id: 'j1' })).toBeUndefined()
    expect(warned.join(' ')).toContain('no status')
  })

  it('stays silent for a type this build has never heard of', () => {
    /*
     * The half that must NOT warn. Forward compatibility is why the parser
     * is permissive: every new event kind py-beacon publishes would
     * otherwise fill the console of every older client.
     */
    expect(parseEvent({ type: 'universe.reindexed', id: 'GLOBAL' })).toBeUndefined()
    expect(warned).toEqual([])
  })

  it('stays silent for something that is not an event at all', () => {
    expect(parseEvent('hello')).toBeUndefined()
    expect(parseEvent(null)).toBeUndefined()
    expect(warned).toEqual([])
  })
})

describe("a failed job's envelope (BN-199)", () => {
  const failed = (error: unknown) =>
    parseEvent({ type: 'job', job_id: 'j1', kind: 'backtest', status: 'failed', error })

  it('carries the code, so a refusal and a crash stop looking alike', () => {
    const event = failed({ code: 'CALCULATION_ERROR', message: 'no JPY/USD rate' })
    expect(event).toMatchObject({ error: { code: 'CALCULATION_ERROR' } })
  })

  it('keeps detail, which is where original_type lives', () => {
    const event = failed({
      code: 'UNEXPECTED_CALCULATION_FAILURE',
      message: 'division by zero',
      detail: { original_type: 'ZeroDivisionError' }
    })
    expect(event).toMatchObject({ error: { detail: { original_type: 'ZeroDivisionError' } } })
  })

  it('reads an older engine’s bare string as unclassified', () => {
    /*
     * py-beacon sent prose until BN-199 and Karan updates the two repos
     * separately, so this is a real state rather than a defensive one. A
     * message with no code IS an unclassified failure — which is also the
     * code py-beacon gives jobs that failed before the change.
     */
    expect(failed('no data for TECH10')).toMatchObject({
      error: { code: 'UNCLASSIFIED_FAILURE', message: 'no data for TECH10' }
    })
  })

  it('drops an envelope it cannot read rather than inventing a code', () => {
    // A code we guessed would be rendered as a heading we chose, which is
    // the whole failure this envelope exists to end.
    expect(failed({ message: 'no code here' })).toMatchObject({ status: 'failed' })
    expect(failed({ message: 'no code here' })?.type === 'job' ? true : false).toBe(true)
    expect((failed({ message: 'no code here' }) as { error?: unknown }).error).toBeUndefined()
  })
})
