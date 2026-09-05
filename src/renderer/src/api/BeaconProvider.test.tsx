import type { ReactElement } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, useQuery } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineState } from '@shared/ipc'
import { BeaconProvider } from './BeaconProvider'
import { JobTray } from './JobTray'
import { useJobs } from './jobs'
import { keys } from './keys'

/** Socket stand-in the test drives frame by frame. */
class FakeSocket {
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onclose: (() => void) | null = null
  static current: FakeSocket | null = null

  constructor() {
    FakeSocket.current = this
  }

  emit(payload: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }))
  }

  close(): void {
    // Silent: calling onclose would make the provider reconnect mid-test.
  }
}

const ENGINE: EngineState = {
  status: 'connected',
  baseUrl: 'http://127.0.0.1:9999',
  token: 'tok',
  version: '0.0.2'
}

let fetches = 0

function CachedPane(): ReactElement {
  const { data } = useQuery({
    queryKey: keys.beacon.weights('TECH10', '2026-07-22'),
    queryFn: () => {
      fetches += 1
      return Promise.resolve({ run: fetches })
    },
    staleTime: Infinity
  })
  return <p>run {data?.run ?? 0}</p>
}

function ReferencePane(): ReactElement {
  const { data } = useQuery({
    queryKey: keys.data.reference('AAPL'),
    queryFn: () => Promise.resolve({ at: Date.now() }),
    staleTime: Infinity
  })
  return <p>reference {data === undefined ? 'pending' : 'loaded'}</p>
}

function setup(): { queries: QueryClient } {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } }
  })

  render(
    <BeaconProvider
      engine={ENGINE}
      queryClient={queries}
      socketFactory={() => new FakeSocket() as unknown as WebSocket}
    >
      <CachedPane />
      <ReferencePane />
      <JobTray />
    </BeaconProvider>
  )

  return { queries }
}

beforeEach(() => {
  fetches = 0
  useJobs.getState().reset()
  FakeSocket.current = null
})

describe('stub long job (BU-21 acceptance)', () => {
  it('streams progress into the tray and settles the cache on success', async () => {
    setup()
    await screen.findByText('run 1')

    const socket = FakeSocket.current
    expect(socket, 'provider should have opened a socket').not.toBeNull()

    // Progress frames land in the affordance.
    socket?.emit({
      type: 'job',
      job_id: 'stub-1',
      kind: 'backtest',
      status: 'running',
      progress: 0.25,
      message: 'computing returns'
    })

    const bar = await screen.findByRole('progressbar', { name: 'backtest' })
    expect(bar).toHaveAttribute('aria-valuenow', '25')
    expect(screen.getByText('computing returns')).toBeInTheDocument()

    socket?.emit({
      type: 'job',
      job_id: 'stub-1',
      kind: 'backtest',
      status: 'running',
      progress: 0.7,
      message: 'building drawdown'
    })
    await waitFor(() => {
      expect(screen.getByRole('progressbar', { name: 'backtest' })).toHaveAttribute(
        'aria-valuenow',
        '70'
      )
    })

    // Success settles the cache: the pane refetches without anything else
    // happening, which is the half that makes the job useful.
    socket?.emit({
      type: 'job',
      job_id: 'stub-1',
      kind: 'backtest',
      status: 'succeeded',
      progress: 1
    })

    await screen.findByText('run 2')

    // ...and the finished job leaves the tray on its own.
    await waitFor(() => {
      expect(screen.queryByRole('progressbar', { name: 'backtest' })).toBeNull()
    })
  })

  it('keeps a failed job on screen with its reason', async () => {
    setup()
    await screen.findByText('run 1')

    FakeSocket.current?.emit({
      type: 'job',
      job_id: 'stub-fail',
      kind: 'sync',
      status: 'failed',
      progress: 0.4,
      error: 'yfinance returned no rows'
    })

    // Nothing else in the UI would tell you the work did not happen.
    expect(await screen.findByText('yfinance returned no rows')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'sync' })).toBeInTheDocument()
  })

  it('lets a failure wrap, since py-beacon explains itself in sentences', async () => {
    setup()
    await screen.findByText('run 1')

    // BN-161's empty-universe error runs to four hundred characters and names
    // the field to look at. One line with an ellipsis is the shape of an
    // answer without the answer in it (BU-162).
    const reason =
      "the calculation for index 'X' is empty — it never held a single constituent — so there " +
      "is nothing to simulate. The likely omission is the definition's universe_identifiers."

    FakeSocket.current?.emit({
      type: 'job',
      job_id: 'stub-long-fail',
      kind: 'backtest',
      status: 'failed',
      progress: 0.05,
      error: reason
    })

    expect(await screen.findByText(reason)).toHaveClass('job-message-failed')
  })

  it('does not refetch on a job that merely started', async () => {
    setup()
    await screen.findByText('run 1')

    FakeSocket.current?.emit({
      type: 'job',
      job_id: 'stub-2',
      kind: 'backtest',
      status: 'running',
      progress: 0.5
    })

    await screen.findByRole('progressbar', { name: 'backtest' })
    expect(screen.getByText('run 1')).toBeInTheDocument()
  })
})

describe('freshness invalidation', () => {
  it('refetches index views when market data changes', async () => {
    setup()
    await screen.findByText('run 1')

    // Index numbers are derived FROM market data, so a market sync makes
    // them stale even though nothing named an index.
    FakeSocket.current?.emit({ type: 'data.freshness', dataset: 'market' })

    await screen.findByText('run 2')
  })

  it('ignores a malformed frame rather than crashing the tree', async () => {
    setup()
    await screen.findByText('run 1')

    FakeSocket.current?.emit({ type: 'job' })
    FakeSocket.current?.emit('not an object')

    // Still mounted, still showing the same data.
    expect(screen.getByText('run 1')).toBeInTheDocument()
  })
})

describe('client availability', () => {
  it('opens no socket while the engine is down', () => {
    const factory = vi.fn(() => new FakeSocket() as unknown as WebSocket)

    render(
      <BeaconProvider engine={{ status: 'degraded' }} socketFactory={factory}>
        <p>shell</p>
      </BeaconProvider>
    )

    // No baseUrl and no token: there is nothing to connect to.
    expect(factory).not.toHaveBeenCalled()
    expect(screen.getByText('shell')).toBeInTheDocument()
  })
})

describe('reconnecting to an engine (BU-86)', () => {
  function mount(engine: EngineState, queries: QueryClient) {
    return render(
      <BeaconProvider
        engine={engine}
        queryClient={queries}
        socketFactory={() => new FakeSocket() as unknown as WebSocket}
      >
        <p>pane</p>
      </BeaconProvider>
    )
  }

  it('drops everything cached when the engine comes back', async () => {
    /*
     * The query keys say nothing about which engine answered, so a restart
     * left every stored answer in place describing a process that is gone.
     * That is how a seeded universe stayed missing for a session: it appeared
     * in the new engine while the app served the old one's empty list.
     */
    const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(queries, 'invalidateQueries')

    const { rerender } = mount({ status: 'degraded' }, queries)
    expect(invalidate).not.toHaveBeenCalled()

    rerender(
      <BeaconProvider
        engine={{ status: 'connected', baseUrl: 'http://127.0.0.1:1', token: 't' }}
        queryClient={queries}
        socketFactory={() => new FakeSocket() as unknown as WebSocket}
      >
        <p>pane</p>
      </BeaconProvider>
    )

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalled()
    })
  })

  it('does not re-invalidate while it stays connected', async () => {
    // Only the TRANSITION matters. Firing on every render would refetch the
    // world whenever anything above this re-rendered.
    const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const connected: EngineState = {
      status: 'connected',
      baseUrl: 'http://127.0.0.1:1',
      token: 't'
    }

    const { rerender } = mount(connected, queries)
    const invalidate = vi.spyOn(queries, 'invalidateQueries')

    rerender(
      <BeaconProvider
        engine={connected}
        queryClient={queries}
        socketFactory={() => new FakeSocket() as unknown as WebSocket}
      >
        <p>pane</p>
      </BeaconProvider>
    )

    await waitFor(() => {
      expect(invalidate).not.toHaveBeenCalled()
    })
  })
})
