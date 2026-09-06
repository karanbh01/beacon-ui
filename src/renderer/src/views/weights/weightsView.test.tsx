import { render, screen } from '@testing-library/react'
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

function client(): BeaconClient {
  return {
    get: (path: string) => {
      if (path.includes('weights')) return Promise.resolve(WEIGHTS)
      if (path.includes('assets')) return Promise.resolve(ASSET)
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

beforeEach(() => {
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
  it('ranks by weight and marks the names sitting at the cap', async () => {
    mountWeights()
    await screen.findByText('NVDA')

    expect(screen.getAllByText('at cap')).toHaveLength(2)
    const first = document.querySelector('.tbl-row')
    expect(first?.textContent).toContain('NVDA')
    expect(first?.textContent).toContain('20.00%')
  })

  it('reports the rebalance in force, which is not the date asked about', async () => {
    // An index holds the weights set at its last rebalance until the next
    // one, so these two differ almost always.
    mountWeights()
    await screen.findByText('NVDA')

    expect(
      screen.getByText(/weights in force at 2026-06-19, asked at 2026-07-22/)
    ).toBeInTheDocument()
  })

  it('says "first rebalance" rather than 0% when there is nothing to drift from', async () => {
    const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const noDrift = {
      get: () => Promise.resolve({ ...WEIGHTS, drift: null })
    } as unknown as BeaconClient
    const tab = useWorkspace.getState().tabs[0]

    render(
      <QueryClientProvider client={queries}>
        <ClientContext.Provider value={noDrift}>
          <IndexWeightsView tab={tab!} subject={undefined} />
        </ClientContext.Provider>
      </QueryClientProvider>
    )

    expect(await screen.findByText('first rebalance')).toBeInTheDocument()
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

  it('opens Drilldown on the name that was clicked', async () => {
    /*
     * This used to write the ticker into the Weights tab's own subject and
     * let a linked Drilldown resolve it. Weights follows Overview now
     * (BU-166), so a subject written here would forward to Overview and turn
     * the page's index into a ticker.
     */
    mountWeightsLinked()
    await userEvent.click(await screen.findByText('AVGO'))

    const drill = useWorkspace.getState().tabs.find((tab) => tab.viewKind === 'asset-drilldown')
    expect(drill?.subject).toBe('AVGO')
  })

  it('never opens a second Drilldown — it retargets the one that is open', async () => {
    mountWeightsLinked()
    await userEvent.click(await screen.findByText('AVGO'))
    await userEvent.click(await screen.findByText('ORCL'))

    const drills = useWorkspace.getState().tabs.filter((t) => t.viewKind === 'asset-drilldown')
    expect(drills).toHaveLength(1)
    expect(drills[0]?.subject).toBe('ORCL')
  })

  it('leaves the page’s index alone', async () => {
    // Reading the index off a constituent would ask py-beacon for the weights
    // of "AVGO".
    mountWeightsLinked()
    await userEvent.click(await screen.findByText('AVGO'))

    const state = useWorkspace.getState()
    expect(state.tabs.find((tab) => tab.id === 'overview')?.subject).toBe('TECH10')
    expect(state.tabs.find((tab) => tab.id === 'weights')?.subject).toBeUndefined()
  })

  it('drills into the index the page is about', async () => {
    mountWeightsLinked()
    await userEvent.click(await screen.findByText('AVGO'))

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
    expect(await screen.findByText(/constituent of TECH10/)).toBeInTheDocument()
  })
})
