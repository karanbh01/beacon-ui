import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { BeaconClient } from '../../api/client'
import { ClientContext } from '../../api/queryClient'
import { REFERENCE_BATCH_LIMIT, useReferenceRows } from './queries'

/**
 * How a long list of names actually arrives (BU-197).
 *
 * The engine caps a batch at a thousand identifiers, so a universe larger
 * than that is several requests — and the map they fill is read on every
 * render. Karan saw the caps "load up constituent by constituent" on his
 * store: the rows are sorted by weight and the chunks are cut
 * alphabetically, so a chunk landing fills a scattered subset of the table
 * rather than a contiguous block of it.
 *
 * This is that, reproduced at the real limit before anything was changed
 * because of it.
 */

const NAMES = Array.from({ length: 2_400 }, (_, i) => `CMP${String(i).padStart(4, '0')}`)

/** A client whose batches resolve only when the test says so. */
function deferredClient(): {
  client: BeaconClient
  calls: string[][]
  settle: (at: number) => void
} {
  const calls: string[][] = []
  const waiting: ((value: unknown) => void)[] = []

  const client = {
    data: {
      referenceBatch: (identifiers: readonly string[]) => {
        const at = calls.length
        calls.push([...identifiers])
        return new Promise((resolve) => {
          waiting[at] = () => {
            resolve({
              as_of: '2026-01-02',
              entries: identifiers.map((identifier) => ({
                identifier,
                found: true,
                fields: { market_cap: 1e9 }
              }))
            })
          }
        })
      }
    }
  } as unknown as BeaconClient

  return {
    client,
    calls,
    settle: (at: number) => {
      waiting[at]?.(undefined)
    }
  }
}

function wrapper(client: BeaconClient): (props: { children: ReactNode }) => ReactElement {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return function Wrapper({ children }): ReactElement {
    return (
      <QueryClientProvider client={queries}>
        <ClientContext.Provider value={client}>{children}</ClientContext.Provider>
      </QueryClientProvider>
    )
  }
}

describe('reference for more names than one batch holds', () => {
  it('splits at the engine cap rather than truncating', async () => {
    const { client, calls } = deferredClient()
    renderHook(() => useReferenceRows(NAMES, ['market_cap']), { wrapper: wrapper(client) })

    await waitFor(() => {
      expect(calls).toHaveLength(3)
    })
    expect(calls[0]).toHaveLength(REFERENCE_BATCH_LIMIT)
    expect(calls[2]).toHaveLength(NAMES.length - 2 * REFERENCE_BATCH_LIMIT)
  })

  it('fills the map one chunk at a time, which is the flicker', async () => {
    /*
     * The reproduction. Between the first answer and the last the hook
     * reports a THIRD of the names — enough for a table to draw caps
     * against some rows and dashes against the rest, which is what a
     * reader sees as loading name by name.
     */
    const { client, calls, settle } = deferredClient()
    const { result } = renderHook(() => useReferenceRows(NAMES, ['market_cap']), {
      wrapper: wrapper(client)
    })

    await waitFor(() => {
      expect(calls).toHaveLength(3)
    })
    settle(0)

    await waitFor(() => {
      expect(result.current.byIdentifier.size).toBe(REFERENCE_BATCH_LIMIT)
    })
    // And it says so, which is what the pane has to read rather than
    // rendering whatever the map holds at the moment.
    expect(result.current.loading).toBe(true)
  })

  it('is done only when every chunk has answered', async () => {
    const { client, calls, settle } = deferredClient()
    const { result } = renderHook(() => useReferenceRows(NAMES, ['market_cap']), {
      wrapper: wrapper(client)
    })

    await waitFor(() => {
      expect(calls).toHaveLength(3)
    })
    for (const at of [0, 1, 2]) settle(at)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.byIdentifier.size).toBe(NAMES.length)
  })

  it('is not loading when there is nothing to ask for', () => {
    // An index that wants no caps passes an empty list, and a pane that
    // waited on this would then never show its table at all.
    const { client } = deferredClient()
    const { result } = renderHook(() => useReferenceRows([], ['market_cap']), {
      wrapper: wrapper(client)
    })

    expect(result.current.loading).toBe(false)
  })
})

describe('the currency a batch asks for', () => {
  it('is part of the question, so two currencies do not share a cache entry', async () => {
    const { client, calls } = deferredClient()
    const view = wrapper(client)

    renderHook(() => useReferenceRows(['CMP000'], ['market_cap'], '2026-01-02', 'USD'), {
      wrapper: view
    })
    await waitFor(() => {
      expect(calls).toHaveLength(1)
    })

    renderHook(() => useReferenceRows(['CMP000'], ['market_cap'], '2026-01-02', 'EUR'), {
      wrapper: view
    })
    // A second request, not a cache hit: the same names on the same date
    // answer with different caps under EUR.
    await waitFor(() => {
      expect(calls).toHaveLength(2)
    })
  })
})

// Silences React's act() advice for the deliberately unsettled promises
// above; the assertions are all through waitFor.
vi.spyOn(console, 'error').mockImplementation(() => undefined)
