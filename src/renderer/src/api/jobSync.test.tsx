import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BeaconClient } from './client'
import { ApiError } from './errors'
import { useJobs } from './jobs'
import { CHECK_EVERY_MS, QUIET_MS, quietJobs, useJobSync } from './jobSync'

const RUNNING = {
  type: 'job' as const,
  job_id: 'generate:synthetic-data',
  kind: 'generate:synthetic-data',
  status: 'running' as const,
  progress: 0.92,
  message: "Reading 'Synthetic data'"
}

function clientAnswering(get: BeaconClient['jobs']['get']): BeaconClient {
  return { jobs: { get } } as unknown as BeaconClient
}

describe('a running job the socket has gone quiet about (0.2.1)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useJobs.getState().reset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is quiet only once nothing has been heard of it for a while', () => {
    useJobs.getState().apply(RUNNING)
    const { jobs } = useJobs.getState()
    expect(quietJobs(jobs, Date.now())).toHaveLength(0)
    expect(quietJobs(jobs, Date.now() + QUIET_MS)).toHaveLength(1)
  })

  it('settles from the engine’s own answer when the finishing frame was missed', async () => {
    useJobs.getState().apply(RUNNING)
    const get = vi.fn().mockResolvedValue({
      job_id: RUNNING.job_id,
      kind: RUNNING.kind,
      status: 'succeeded',
      progress: 1,
      message: 'Serving the new data',
      result: null,
      error: null
    })
    const onSucceeded = vi.fn()
    renderHook(() => {
      useJobSync(clientAnswering(get), onSucceeded)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUIET_MS + CHECK_EVERY_MS)
    })

    expect(get).toHaveBeenCalledWith(RUNNING.job_id)
    expect(useJobs.getState().jobs[RUNNING.job_id]?.status).toBe('succeeded')
    expect(onSucceeded).toHaveBeenCalled()
  })

  it('closes a job the engine no longer knows as failed, not running for ever', async () => {
    useJobs.getState().apply(RUNNING)
    const get = vi
      .fn()
      .mockRejectedValue(new ApiError(404, { code: 'NOT_FOUND', message: 'no such job' }))
    renderHook(() => {
      useJobSync(clientAnswering(get), vi.fn())
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUIET_MS + CHECK_EVERY_MS)
    })

    expect(useJobs.getState().jobs[RUNNING.job_id]?.status).toBe('failed')
  })

  it('leaves alone a job it keeps hearing about', async () => {
    useJobs.getState().apply(RUNNING)
    const get = vi.fn()
    renderHook(() => {
      useJobSync(clientAnswering(get), vi.fn())
    })

    for (let tick = 0; tick < 3; tick++) {
      await act(async () => {
        useJobs.getState().apply({ ...RUNNING, progress: 0.93 + tick / 100 })
        await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS)
      })
    }

    expect(get).not.toHaveBeenCalled()
  })
})
