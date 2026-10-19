import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BeaconClient } from '../../api/client'
import { ClientContext } from '../../api/queryClient'
import { resolveSubject } from '../../state/tabs.logic'
import { useWorkspace } from '../../state/tabs.store'
import { DrilldownView } from '../drilldown/DrilldownView'
import { IndexWeightsView } from './IndexWeightsView'

const WEIGHTS = {
  index_id: 'TECH10',
  as_of: '2026-07-22',
  rebalance_date: '2026-06-19',
  weights: { NVDA: 0.2, MSFT: 0.2, AVGO: 0.1662, ORCL: 0.0692 },
  capped: ['NVDA', 'MSFT'],
  cap: 0.2,
  cap_redistributed: 0.031,
  concentration: {
    constituents: 4,
    effective_assets: 6.3,
    herfindahl: 0.158,
    largest: 0.2,
    top_weights: { '5': 0.835 }
  },
  drift: {
    since: '2026-06-19',
    turnover: 0.014,
    total_absolute: 0.028,
    maximum: 0.0042,
    worst: 'AVGO'
  }
}

/*
 * A strategy's holdings workflow (py-beacon 0.9.3, BN-326): five universe
 * names, one dropped by the index's filter, one by the minimum price, and
 * three held, the two largest capped by the index.
 */
const HOLDINGS = {
  strategy_id: 'TECH10',
  index_id: 'TECH10',
  as_of: '2026-07-22',
  rebalance_date: '2026-06-19',
  rebalance_dates: ['2026-03-20', '2026-06-19'],
  cash_weight: 0.02,
  stages: [
    {
      key: 'universe',
      label: 'Universe',
      kind: 'universe',
      remaining: 5,
      type: 'Stage',
      description: 'What it does.'
    },
    {
      key: 'rule-1',
      label: 'Filter',
      kind: 'index_rule',
      remaining: 4,
      type: 'Stage',
      description: 'What it does.'
    },
    {
      key: 'index-cap',
      label: 'Index cap',
      kind: 'index_cap',
      remaining: 4,
      type: 'Stage',
      description: 'What it does.'
    },
    {
      key: 'stale-price',
      label: 'Stale price',
      kind: 'implementation_screen',
      remaining: 4,
      type: 'Stage',
      description: 'What it does.'
    },
    {
      key: 'minimum-price',
      label: 'Minimum price',
      kind: 'implementation_screen',
      remaining: 3,
      type: 'Stage',
      description: 'What it does.'
    }
  ],
  rows: [
    held('AVGO', 0.1662, 0.1662, 0.36, -0.0042),
    held('NVDA', 0.24, 0.2, 0.41, 0.004),
    held('MSFT', 0.24, 0.2, 0.21, 0.001),
    dropped('ORCL', 'minimum-price', 0.0692),
    dropped('INTC', 'rule-1', null)
  ]
}

function held(
  identifier: string,
  uncapped: number,
  index: number,
  portfolio: number,
  drift: number
) {
  return {
    identifier,
    reference: { name: `${identifier} Inc.` },
    excluded_at: null,
    index_weight_uncapped: uncapped,
    index_weight: index,
    benchmark_weight: null,
    strategy_weight: index,
    implementation: { 'stale-price': index, 'minimum-price': portfolio },
    portfolio_weight: portfolio,
    weight_drift: drift,
    current_weight: portfolio + drift,
    shares_held: Math.round(portfolio * 1_000_000)
  }
}

function dropped(identifier: string, at: string, index: number | null) {
  return {
    identifier,
    reference: { name: `${identifier} Inc.` },
    excluded_at: at,
    index_weight_uncapped: index,
    index_weight: index,
    benchmark_weight: null,
    strategy_weight: index,
    implementation: { 'stale-price': index, 'minimum-price': null },
    portfolio_weight: null,
    weight_drift: null,
    current_weight: null,
    shares_held: null
  }
}

const ASSET = {
  index_id: 'TECH10',
  identifier: 'AVGO',
  beta: 1.02,
  correlation: 0.91,
  excess_return: 0.127,
  index_return: 0.142,
  observations: 1600,
  rebalances_held: 12,
  total_return: 0.269,
  tracking_error: 0.084,
  price: { index: ['2026-01-01', '2026-07-22'], data: [100, 126.9] },
  weight_history: { '2026-03-20': 0.15, '2026-06-19': 0.1662 }
}

/** The dates the holdings were asked for, in order. */
let askedDates: (string | undefined)[] = []

function client(): BeaconClient {
  return {
    get: (path: string, request?: { query?: { date?: string } }) => {
      if (path.includes('holdings')) {
        const date = request?.query?.date
        askedDates.push(date)
        // On a rebalance day the engine reports no drift.
        return Promise.resolve(
          date === '2026-03-20' ? { ...HOLDINGS, as_of: date, rebalance_date: date } : HOLDINGS
        )
      }
      if (path.includes('weights')) return Promise.resolve(WEIGHTS)
      // The run's rebalances, for the picker before the first run.
      if (path.includes('/result')) {
        return Promise.resolve({
          rebalances: [
            { date: '2026-03-20', weights: {} },
            { date: '2026-06-19', weights: {} }
          ]
        })
      }
      if (path.includes('assets')) return Promise.resolve(asset)
      return Promise.resolve({
        index_id: 'TECH10',
        name: 'TECH10',
        start: '2020-01-01',
        end: '2026-07-22',
        observations: 1600,
        rebalances: 26,
        last_rebalance: '2026-06-19',
        level: { index: ['2026-01-01', '2026-07-22'], data: [100, 114.2] },
        metrics: {
          annualised_return: 0.207,
          volatility: 0.225,
          sharpe_ratio: 0.72,
          max_drawdown: -0.334,
          total_return: 2.41
        },
        concentration: WEIGHTS.concentration
      })
    }
  } as unknown as BeaconClient
}

function mountWeights(): void {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const tab = useWorkspace.getState().tabs.find((candidate) => candidate.id === 'weights')
  render(
    <QueryClientProvider client={queries}>
      <ClientContext.Provider value={client()}>
        <IndexWeightsView tab={tab!} subject={undefined} />
      </ClientContext.Provider>
    </QueryClientProvider>
  )
}

/** Holdings Detail opens empty: press Run, then wait for a name (Karan, 2026-10-19). */
async function runAndFind(name: string): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole('button', { name: 'Run' }))
  return screen.findByText(name)
}

/** The asset view the client serves; a test can give it currencies. */
let asset: Record<string, unknown> = ASSET

beforeEach(() => {
  asset = ASSET
  askedDates = []
  localStorage.clear()
  const store = useWorkspace.getState()
  store.reset()
  store.openTab({
    id: 'weights',
    page: 'beacon-view',
    viewKind: 'weights',
    archetype: 'query',
    title: 'Weights',
    pinnedDoc: 'TECH10'
  })
  // The page's subject-holder (BU-166): Weights follows this and Drilldown
  // reads the index off it.
  store.openTab({
    id: 'overview',
    page: 'beacon-view',
    viewKind: 'overview',
    archetype: 'query',
    title: 'Overview',
    subject: 'TECH10'
  })
})

describe('IndexWeightsView', () => {
  it('reads the workflow left to right, from the index to what is held now', async () => {
    mountWeights()
    await runAndFind('NVDA')

    const headers = [...document.querySelectorAll('[role="columnheader"]')].map(
      (header) => header.textContent
    )
    expect(headers.slice(headers.indexOf('01 · Filter'))).toEqual([
      '01 · Filter',
      'Uncapped Index Weight',
      'Index Weight',
      'Stale price',
      'Minimum price',
      'Portfolio Weight',
      'Weight Drift',
      'Current Portfolio Weight',
      'Shares Held'
    ])
    // No benchmark on this run, so no column of dashes for one.
    expect(headers).not.toContain('Benchmark Weight')
  })

  it('holds the largest first, then the names that dropped out, marked where they left', async () => {
    mountWeights()
    await runAndFind('NVDA')

    const rows = [...document.querySelectorAll('.tbl-body .tbl-row')]
    expect(rows.map((row) => row.querySelector('[role="cell"]')?.textContent)).toEqual([
      'NVDA',
      'AVGO',
      'MSFT',
      'ORCL',
      'INTC'
    ])
    // ORCL passed the index and the stale-price screen, and the minimum price dropped it.
    expect(rows[3]?.textContent).toContain('✓6.92%6.92%✓✕')
    // INTC never reached the screens after the filter that dropped it.
    expect(rows[4]?.textContent).toContain('✕')
    expect(rows[4]?.textContent).toContain('··')
  })

  it('shows weights and drift in percent', async () => {
    mountWeights()
    await runAndFind('NVDA')

    const nvda = document.querySelector('.tbl-body .tbl-row')
    expect(nvda?.textContent).toContain('41.00%')
    expect(nvda?.textContent).toContain('+0.40%')
    expect(nvda?.textContent).toContain('41.40%')
  })

  it('says which day the weights are, with the rebalance they came from in its own field', async () => {
    // An index holds the weights set at its last rebalance until the next
    // one, so the two dates differ almost always (Karan, 2026-10-19).
    mountWeights()
    await runAndFind('NVDA')

    expect(
      screen.getByText('weights as of 2026-07-22 · click a row to open Drilldown')
    ).toBeInTheDocument()
    expect(screen.getByText('2026-06-19')).toBeInTheDocument()
  })

  it("offers the run's rebalances, newest first, and asks for the one picked", async () => {
    const user = userEvent.setup()
    mountWeights()
    await runAndFind('NVDA')

    await user.click(screen.getByRole('combobox', { name: 'Rebalance' }))
    const options = within(screen.getByRole('listbox', { name: 'Rebalance' })).getAllByRole(
      'option'
    )
    expect(options.map((option) => option.textContent)).toEqual(['2026-06-19', '2026-03-20'])

    await user.click(options[1]!)
    expect(askedDates).toContain('2026-03-20')
  })

  it('leaves out the drift columns on a rebalance day, when nothing has drifted', async () => {
    const user = userEvent.setup()
    mountWeights()
    await runAndFind('NVDA')

    await user.click(screen.getByRole('combobox', { name: 'Rebalance' }))
    await user.click(screen.getByRole('option', { name: '2026-03-20' }))

    await screen.findByText('weights as of 2026-03-20 · click a row to open Drilldown')
    expect(screen.queryByRole('columnheader', { name: 'Weight Drift' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Current Portfolio Weight' })).toBeNull()
  })
})

describe('Weights into Drilldown (BU-29, BU-166)', () => {
  function mountWeightsLinked(): void {
    const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const state = useWorkspace.getState()
    const weights = state.tabs.find((tab) => tab.id === 'weights')

    render(
      <QueryClientProvider client={queries}>
        <ClientContext.Provider value={client()}>
          <IndexWeightsView tab={weights!} subject={resolveSubject(state, weights!)} pane={0} />
        </ClientContext.Provider>
      </QueryClientProvider>
    )
  }

  /** Click through from Weights, then draw the Drilldown that opened. */
  async function mountDrilldown(): Promise<HTMLElement> {
    mountWeightsLinked()
    await userEvent.click(await runAndFind('AVGO'))

    const state = useWorkspace.getState()
    const drill = state.tabs.find((tab) => tab.viewKind === 'asset-drilldown')
    if (drill === undefined) throw new Error('no Drilldown opened')

    const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    return render(
      <QueryClientProvider client={queries}>
        <ClientContext.Provider value={client()}>
          <DrilldownView tab={drill} subject={resolveSubject(state, drill)} pane={0} />
        </ClientContext.Provider>
      </QueryClientProvider>
    ).container
  }

  it('opens Drilldown on the name that was clicked', async () => {
    /*
     * This used to write the ticker into the Weights tab's own subject and
     * let a linked Drilldown resolve it. Weights follows Overview now
     * (BU-166), so a subject written here would forward to Overview and turn
     * the page's index into a ticker.
     */
    mountWeightsLinked()
    await userEvent.click(await runAndFind('AVGO'))

    const drill = useWorkspace.getState().tabs.find((tab) => tab.viewKind === 'asset-drilldown')
    expect(drill?.subject).toBe('AVGO')
  })

  it('never opens a second Drilldown — it retargets the one that is open', async () => {
    mountWeightsLinked()
    await userEvent.click(await runAndFind('AVGO'))
    await userEvent.click(await screen.findByText('ORCL'))

    const drills = useWorkspace.getState().tabs.filter((t) => t.viewKind === 'asset-drilldown')
    expect(drills).toHaveLength(1)
    expect(drills[0]?.subject).toBe('ORCL')
  })

  it('leaves the page’s index alone', async () => {
    // Reading the index off a constituent would ask py-beacon for the weights
    // of "AVGO".
    mountWeightsLinked()
    await userEvent.click(await runAndFind('AVGO'))

    const state = useWorkspace.getState()
    expect(state.tabs.find((tab) => tab.id === 'overview')?.subject).toBe('TECH10')
    expect(state.tabs.find((tab) => tab.id === 'weights')?.subject).toBeUndefined()
  })

  it('drills into the strategy the page is about', async () => {
    mountWeightsLinked()
    await userEvent.click(await runAndFind('AVGO'))

    const state = useWorkspace.getState()
    const drill = state.tabs.find((tab) => tab.viewKind === 'asset-drilldown')

    const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    render(
      <QueryClientProvider client={queries}>
        <ClientContext.Provider value={client()}>
          <DrilldownView tab={drill!} subject={resolveSubject(state, drill!)} pane={0} />
        </ClientContext.Provider>
      </QueryClientProvider>
    )

    // The index comes from Overview, not from a hard-coded 'TECH10' (BU-166).
    expect(await screen.findByText(/held by TECH10/)).toBeInTheDocument()
  })

  it('says which currency the returns are in, and which the price is', async () => {
    /*
     * BU-220. Since py-beacon 0.3.0 the returns are the index's currency and
     * the price the name's own; for a GBP name in a USD index the headline
     * return no longer matches the price line, so both say what they are.
     */
    asset = { ...ASSET, currency: 'USD', price_currency: 'GBP' }
    const drilldown = within(await mountDrilldown())

    expect(await drilldown.findByText('total return (USD)')).toBeInTheDocument()
    expect(drilldown.getByText('excess vs TECH10 (USD)')).toBeInTheDocument()
  })

  it('says nothing about currency for an engine that does not', async () => {
    // Before 0.3.0 the view carries neither field; a guessed label would be
    // a claim about money the engine never made.
    const drilldown = within(await mountDrilldown())

    expect(await drilldown.findByText('total return')).toBeInTheDocument()
    expect(drilldown.queryByText(/total return \(/)).toBeNull()
  })
})

describe('Holdings Detail before it runs', () => {
  it('opens empty, asking for a date, and reads nothing until Run', async () => {
    mountWeights()

    expect(await screen.findByText(/then run to see the strategy/)).toBeInTheDocument()
    expect(askedDates).toEqual([])

    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    await screen.findByText('NVDA')
    expect(askedDates).toHaveLength(1)
  })
})

describe('the order of the holdings (BN-326)', () => {
  it('puts every held name above every name that dropped out', async () => {
    const { holdingsOrder } = await import('./holdingsColumns')
    const ordered = holdingsOrder(HOLDINGS.rows, HOLDINGS.stages)

    const firstDropped = ordered.findIndex((row) => row.excluded_at != null)
    expect(ordered.slice(firstDropped).every((row) => row.excluded_at != null)).toBe(true)
    expect(ordered.slice(0, firstDropped).map((row) => row.identifier)).toEqual([
      'NVDA',
      'AVGO',
      'MSFT'
    ])
  })
})
