import { beforeEach, describe, expect, it } from 'vitest'
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

  it('keeps the failure reason', () => {
    useJobs.getState().apply({
      type: 'job',
      job_id: 'j1',
      kind: 'backtest',
      status: 'failed',
      progress: 0.3,
      error: 'no data for TECH10'
    })

    expect(useJobs.getState().jobs.j1?.error).toBe('no data for TECH10')
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
