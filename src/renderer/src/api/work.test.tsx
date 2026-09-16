import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useJobs } from './jobs'
import { useBackgroundWork, workKey } from './work'

/**
 * What counts as background work (BU-201).
 *
 * Two mechanisms, one answer. An engine JOB arrives on the event feed and
 * outlives the pane that started it; a long MUTATION is an ordinary request
 * that happens to take seconds. The difference is ours, not the reader's.
 */

function wrapper(): (props: { children: ReactNode }) => ReactElement {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return function Wrapper({ children }): ReactElement {
    return <QueryClientProvider client={queries}>{children}</QueryClientProvider>
  }
}

/** A mutation that stays pending until the test releases it. */
function held(label: string) {
  let release = (): void => undefined
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    release: () => {
      release()
    },
    use: () =>
      useMutation({
        mutationKey: workKey(label),
        mutationFn: () => promise
      })
  }
}

beforeEach(() => {
  useJobs.getState().reset()
})

describe('a long mutation', () => {
  it('is named in the footer while it runs, and gone when it settles', async () => {
    const slow = held('previewing')
    const { result } = renderHook(() => ({ work: useBackgroundWork(), mutation: slow.use() }), {
      wrapper: wrapper()
    })

    expect(result.current.work.running).toEqual([])

    act(() => {
      result.current.mutation.mutate()
    })
    await waitFor(() => {
      expect(result.current.work.running).toEqual(['previewing'])
    })

    act(() => {
      slow.release()
    })
    await waitFor(() => {
      expect(result.current.work.running).toEqual([])
    })
  })

  it('counts two of the same kind separately, since two are running', async () => {
    const one = held('validating')
    const two = held('validating')
    const { result } = renderHook(
      () => ({ work: useBackgroundWork(), a: one.use(), b: two.use() }),
      { wrapper: wrapper() }
    )

    act(() => {
      result.current.a.mutate()
      result.current.b.mutate()
    })
    await waitFor(() => {
      expect(result.current.work.running).toEqual(['validating', 'validating'])
    })
  })
})

describe('an engine job', () => {
  const event = (status: 'running' | 'succeeded') =>
    ({ type: 'job', job_id: 'job-1', kind: 'backtest', status, progress: 0.4 }) as const

  it('counts while it is not terminal', () => {
    const { result } = renderHook(() => useBackgroundWork(), { wrapper: wrapper() })

    act(() => {
      useJobs.getState().apply(event('running'))
    })
    expect(result.current.running).toEqual(['backtest'])
  })

  it('stops counting the moment it settles, not when the tray clears it', () => {
    /*
     * The tray keeps a finished job visible for a while on purpose. The
     * footer answers a different question — is anything still going — so a
     * job that has succeeded is finished here immediately.
     */
    const { result } = renderHook(() => useBackgroundWork(), { wrapper: wrapper() })

    act(() => {
      useJobs.getState().apply(event('running'))
      useJobs.getState().apply(event('succeeded'))
    })
    expect(result.current.running).toEqual([])
    expect(Object.keys(useJobs.getState().jobs)).toHaveLength(1)
  })
})
