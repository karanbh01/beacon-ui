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
  store.openTab({
    id: 'drill',
    page: 'beacon-view',
    viewKind: 'asset-drilldown',
    archetype: 'linked',
    title: 'Drilldown',
    linkSourceId: 'weights',
    pinnedDoc: 'TECH10'
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

describe('Drilldown as the second linked view (BU-29)', () => {
  function mountBoth(): void {
    const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const state = useWorkspace.getState()
    const weights = state.tabs.find((tab) => tab.id === 'weights')
    const drill = state.tabs.find((tab) => tab.id === 'drill')

    render(
      <QueryClientProvider client={queries}>
        <ClientContext.Provider value={client()}>
          <IndexWeightsView tab={weights!} subject={undefined} />
          <DrilldownView tab={drill!} subject={resolveSubject(state, drill!)} />
        </ClientContext.Provider>
      </QueryClientProvider>
    )
  }

  it('selects INTO the Weights tab, so the linked pane follows', async () => {
    // The first linked view follows Prices on Data Explorer; this one follows
    // Weights on Beacon View. Neither knows about the other — both resolve
    // their subject from whatever tab they were linked to.
    mountBoth()
    await userEvent.click(await screen.findByText('AVGO'))

    const state = useWorkspace.getState()
    expect(state.tabs.find((tab) => tab.id === 'weights')?.subject).toBe('AVGO')
    expect(state.tabs.find((tab) => tab.id === 'drill')?.archetype).toBe('linked')
  })

  it('never opens a second Drilldown — the link is the mechanism', async () => {
    mountBoth()
    await userEvent.click(await screen.findByText('AVGO'))

    expect(
      useWorkspace.getState().tabs.filter((tab) => tab.viewKind === 'asset-drilldown')
    ).toHaveLength(1)
  })

  it('keeps the index and the selected constituent apart', async () => {
    // The pin names the index; the subject names the constituent. Reading the
    // index off `subject` would ask py-beacon for weights of "AVGO".
    mountBoth()
    await userEvent.click(await screen.findByText('AVGO'))

    const weights = useWorkspace.getState().tabs.find((tab) => tab.id === 'weights')
    expect(weights?.pinnedDoc).toBe('TECH10')
    expect(weights?.subject).toBe('AVGO')
  })
})
