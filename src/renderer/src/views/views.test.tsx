import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BeaconClient } from '../api/client'
import { ApiError, NetworkError } from '../api/errors'
import { ClientContext } from '../api/queryClient'
import { useWorkspace } from '../state/tabs.store'
import type { Tab } from '../state/tabs.types'
import { CorporateActionsView } from './corporate-actions/CorporateActionsView'
import { CoverageView } from './coverage/CoverageView'
import { ReferenceView } from './reference/ReferenceView'
import { WatchlistView } from './watchlist/WatchlistView'

function tab(viewKind: string): Tab {
  return { id: 't', page: 'data-explorer', viewKind, archetype: 'query', title: 'T', dirty: false }
}

/** A response, or a function of the identifier the view asked for. */
type Reply = unknown

interface Responses {
  reference?: Reply
  corporateActions?: Reply
  prices?: Reply
  coverage?: Reply
  watchlists?: Reply
  sync?: (dataset: string) => unknown
  putWatchlist?: (id: string, body: unknown) => unknown
}

/**
 * A client whose calls are supplied per test.
 *
 * Retries are off so a rejection surfaces on the first render pass rather
 * than after the query client's backoff, which would make every error test
 * wait on real timers.
 */
function mount(view: ReactElement, responses: Responses): HTMLElement {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } }
  })

  const resolve = (reply: Reply, identifier = ''): Promise<never> => {
    const value =
      typeof reply === 'function' ? (reply as (id: string) => unknown)(identifier) : reply
    return value instanceof Error
      ? Promise.reject(value)
      : (Promise.resolve(value) as Promise<never>)
  }

  const client = {
    data: {
      reference: (id: string) => resolve(responses.reference, id),
      corporateActions: (id: string) => resolve(responses.corporateActions, id),
      prices: (id: string) => resolve(responses.prices, id),
      coverage: () => resolve(responses.coverage),
      watchlists: () => resolve(responses.watchlists),
      sync: (dataset: string) => Promise.resolve(responses.sync?.(dataset)),
      putWatchlist: (id: string, body: unknown) =>
        Promise.resolve(responses.putWatchlist?.(id, body))
    }
  } as unknown as BeaconClient

  return render(
    <QueryClientProvider client={queries}>
      <ClientContext.Provider value={client}>{view}</ClientContext.Provider>
    </QueryClientProvider>
  ).container
}

describe('ReferenceView', () => {
  const FIELDS = {
    identifier: 'AAPL',
    fields: { name: 'Apple Inc.', currency: 'USD', sector: 'Technology', mystery_column: 'x' }
  }

  it('renders the four Figma cards once the engine answers', async () => {
    mount(<ReferenceView tab={tab('reference-data')} subject="AAPL" />, { reference: FIELDS })

    expect(await screen.findByText('Identifiers')).toBeInTheDocument()
    expect(screen.getByText('Classification')).toBeInTheDocument()
    expect(screen.getByText('Corporate profile')).toBeInTheDocument()
    expect(screen.getByText('Universe membership')).toBeInTheDocument()
  })

  it('shows a dash for a field this engine does not carry', async () => {
    mount(<ReferenceView tab={tab('reference-data')} subject="AAPL" />, { reference: FIELDS })

    // The row must stay: a shorter card would read as "no ISIN exists" rather
    // than "this reference source does not publish one".
    const isin = (await screen.findByText('ISIN')).closest('.kv')
    expect(isin?.querySelector('.kv-value')?.textContent).toBe('—')
  })

  it('admits the fields its cards do not show', async () => {
    mount(<ReferenceView tab={tab('reference-data')} subject="AAPL" />, { reference: FIELDS })

    expect(await screen.findByText(/1 not shown on these cards/)).toBeInTheDocument()
  })

  it('asks for an identifier instead of querying for an empty one', () => {
    mount(<ReferenceView tab={tab('reference-data')} subject={undefined} />, {})

    expect(screen.getByText(/Type an identifier/)).toBeInTheDocument()
  })

  it('names the engine, not the request, when the engine is unreachable', async () => {
    mount(<ReferenceView tab={tab('reference-data')} subject="AAPL" />, {
      reference: new NetworkError('down')
    })

    expect(await screen.findByText(/engine is not reachable/)).toBeInTheDocument()
  })
})

describe('CorporateActionsView', () => {
  const ACTIONS = {
    identifier: 'AAPL',
    actions: [
      { ex_date: '2026-05-09', type: 'DIVIDEND', value: 0.26 },
      { ex_date: '2026-02-07', type: 'DIVIDEND', value: 0.25 },
      { ex_date: '2020-08-31', type: 'SPLIT', value: 4 }
    ],
    cumulative_split_ratio: 4,
    trailing_dividend: 1.03,
    trailing_dividend_yield: 0.0049
  }

  it('summarises what py-beacon computed rather than recomputing it', async () => {
    mount(<CorporateActionsView tab={tab('corporate-actions')} subject="AAPL" />, {
      corporateActions: ACTIONS
    })

    expect(await screen.findByText('1.03 / share')).toBeInTheDocument()
    expect(screen.getByText('0.49%')).toBeInTheDocument()
    expect(screen.getByText('×4.00')).toBeInTheDocument()
  })

  it('lists actions newest first', async () => {
    const container = mount(
      <CorporateActionsView tab={tab('corporate-actions')} subject="AAPL" />,
      {
        corporateActions: ACTIONS
      }
    )

    await screen.findByText('09 May 2026')
    const dates = [...container.querySelectorAll('.tbl-row')].map(
      (row) => row.firstElementChild?.textContent
    )
    expect(dates).toEqual(['09 May 2026', '07 Feb 2026', '31 Aug 2020'])
  })

  it('filters client-side, leaving the server-computed totals standing', async () => {
    mount(<CorporateActionsView tab={tab('corporate-actions')} subject="AAPL" />, {
      corporateActions: ACTIONS
    })

    await userEvent.click(await screen.findByRole('radio', { name: 'Split' }))

    expect(screen.getByText('31 Aug 2020')).toBeInTheDocument()
    expect(screen.queryByText('09 May 2026')).not.toBeInTheDocument()
    // The dividend total is over everything the engine sent, so filtering the
    // table must not appear to change it.
    expect(screen.getByText('1.03 / share')).toBeInTheDocument()
    expect(screen.getByText(/1 action of 3/)).toBeInTheDocument()
  })

  it('says nothing rather than guessing when no future action was sent', async () => {
    mount(<CorporateActionsView tab={tab('corporate-actions')} subject="AAPL" />, {
      corporateActions: { ...ACTIONS, actions: [] }
    })

    expect(await screen.findByText(/No corporate actions/)).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('explains a missing data source instead of showing a raw failure', async () => {
    mount(<CorporateActionsView tab={tab('corporate-actions')} subject="AAPL" />, {
      corporateActions: new ApiError(500, {
        code: 'CONFIGURATION_ERROR',
        message: 'no data source configured'
      })
    })

    expect(await screen.findByText(/no data source/)).toBeInTheDocument()
  })
})

describe('CoverageView', () => {
  const COVERAGE = {
    datasets: [
      {
        dataset: 'market',
        configured: true,
        identifiers: 12_847,
        start: '1962-01-02',
        end: '2026-07-28',
        cache_age: 7_200,
        last_refreshed: '2026-07-28T06:00:00Z'
      },
      {
        dataset: 'reference',
        configured: false,
        identifiers: 0,
        start: null,
        end: null,
        cache_age: null,
        last_refreshed: null
      }
    ]
  }

  it('states what each dataset holds and how old it is', async () => {
    const container = mount(<CoverageView />, { coverage: COVERAGE })

    await screen.findByText('Not loaded')
    const cells = [...container.querySelectorAll('.tbl-row')].map((row) =>
      [...row.children].map((cell) => cell.textContent)
    )

    expect(cells[0]).toEqual(['Market', '12,847', '1962 → 2026', '2h ago', 'OK', 'Sync'])
  })

  it('distinguishes a dataset that is not loaded from one that is merely old', async () => {
    mount(<CoverageView />, { coverage: COVERAGE })

    expect(await screen.findByText('OK')).toBeInTheDocument()
    expect(screen.getByText('Not loaded')).toBeInTheDocument()
  })

  it('reports the largest dataset rather than a misleading total', async () => {
    const container = mount(<CoverageView />, { coverage: COVERAGE })

    // Summing the two would read 12,847 — the union is unknowable from
    // per-dataset counts, so the strip says which number it is showing.
    const stat = (await screen.findByText('LARGEST DATASET')).closest('.stat')
    expect(stat?.querySelector('.stat-value')?.textContent).toBe('12,847')
    expect(container.querySelector('.stat-strip')).not.toBeNull()
  })

  it('syncs one dataset per job, skipping the ones with no source', async () => {
    const synced: string[] = []
    mount(<CoverageView />, {
      coverage: COVERAGE,
      sync: (dataset) => {
        synced.push(dataset)
        return { job_id: 'j1', kind: 'sync', status: 'pending', progress: 0, message: '' }
      }
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Force sync' }))
    expect(synced).toEqual(['market'])
  })

  it('will not offer to sync a dataset the engine has no source for', async () => {
    const container = mount(<CoverageView />, { coverage: COVERAGE })

    await screen.findByText('Not loaded')
    const buttons = [...container.querySelectorAll('.tbl-row button')]
    expect(buttons.map((button) => (button as HTMLButtonElement).disabled)).toEqual([false, true])
  })
})

describe('WatchlistView', () => {
  const LISTS = {
    watchlists: [{ id: 'core-tech', name: 'Core Tech', identifiers: ['AAPL', 'MSFT'] }]
  }

  const PRICES = {
    interval: '1d',
    prices: {
      index: ['2025-12-31T00:00:00', '2026-07-27T00:00:00', '2026-07-28T00:00:00'],
      columns: ['close', 'volume'],
      data: [
        [100, 1_000],
        [200, 2_000],
        [220, 3_000]
      ]
    }
  }

  beforeEach(() => {
    localStorage.clear()
    useWorkspace.getState().reset()
  })

  it('shows one row per symbol with a name from reference', async () => {
    mount(<WatchlistView tab={tab('watchlist')} subject={undefined} />, {
      watchlists: LISTS,
      prices: PRICES,
      reference: (id: string) => ({ identifier: id, fields: { name: `${id} Inc.` } })
    })

    expect(await screen.findByText('AAPL Inc.')).toBeInTheDocument()
    expect(screen.getByText('MSFT Inc.')).toBeInTheDocument()
  })

  it('measures YTD from the prior year close, not the first bar of this year', async () => {
    mount(<WatchlistView tab={tab('watchlist')} subject={undefined} />, {
      watchlists: LISTS,
      prices: PRICES,
      reference: {}
    })

    // 220 against the 2025 close of 100 is +120.0%; against 2026's first bar
    // it would read +10.0%.
    expect((await screen.findAllByText('+120.0%')).length).toBeGreaterThan(0)
  })

  it('retargets the Prices tab when a row is clicked', async () => {
    useWorkspace.getState().openTab({
      id: 'prices',
      page: 'data-explorer',
      viewKind: 'prices',
      archetype: 'query',
      title: 'Prices',
      subject: 'AAPL'
    })

    mount(<WatchlistView tab={tab('watchlist')} subject={undefined} />, {
      watchlists: LISTS,
      prices: PRICES,
      reference: {}
    })

    await userEvent.click(await screen.findByText('MSFT'))

    const tabs = useWorkspace.getState().tabs
    expect(tabs).toHaveLength(1)
    expect(tabs[0]?.subject).toBe('MSFT')
  })

  it('saves the whole list when a symbol is added, since PUT replaces it', async () => {
    const saved: unknown[] = []
    mount(<WatchlistView tab={tab('watchlist')} subject={undefined} />, {
      watchlists: LISTS,
      prices: PRICES,
      reference: {},
      putWatchlist: (id, body) => {
        saved.push({ id, body })
        return { id, ...(body as object) }
      }
    })

    await userEvent.click(await screen.findByRole('button', { name: /Add symbol/ }))
    await userEvent.type(screen.getByLabelText('Add symbol'), 'nvda{Enter}')

    expect(saved).toEqual([
      { id: 'core-tech', body: { name: 'Core Tech', identifiers: ['AAPL', 'MSFT', 'NVDA'] } }
    ])
  })

  it('says where watchlists live when the engine has none', async () => {
    mount(<WatchlistView tab={tab('watchlist')} subject={undefined} />, {
      watchlists: { watchlists: [] }
    })

    expect(await screen.findByText(/no watchlists/)).toBeInTheDocument()
  })
})
