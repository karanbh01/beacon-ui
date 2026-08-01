import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BeaconClient } from '../../api/client'
import { ClientContext } from '../../api/queryClient'
import { useWorkspace } from '../../state/tabs.store'
import { AttributionView } from './AttributionView'
import type { AttributionView as AttributionPayload } from './attribution'

const RECONCILING: AttributionPayload = {
  index_id: 'TECH10',
  start: '2026-01-01',
  end: '2026-07-22',
  periods: 138,
  total_return: 0.142,
  residual: 0,
  reconciles: true,
  cap_drag: -0.008,
  cost_drag: null,
  contributions: [
    { asset_id: 'AVGO', average_weight: 0.174, total_return: 0.269, contribution: 0.0468 },
    { asset_id: 'CRM', average_weight: 0.05, total_return: -0.089, contribution: -0.0045 }
  ]
}

function mount(payload: AttributionPayload): void {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const client = {
    get: () => Promise.resolve(payload)
  } as unknown as BeaconClient

  const tab = useWorkspace.getState().tabs[0]
  render(
    <QueryClientProvider client={queries}>
      <ClientContext.Provider value={client}>
        <AttributionView tab={tab!} subject={undefined} />
      </ClientContext.Provider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  const store = useWorkspace.getState()
  store.reset()
  store.openTab({
    id: 'attr',
    page: 'beacon-view',
    viewKind: 'attribution',
    archetype: 'pinned',
    title: 'Attribution',
    pinnedDoc: 'TECH10'
  })
})

describe('AttributionView', () => {
  it('shows the decomposition when the parts add up', async () => {
    mount(RECONCILING)

    expect(await screen.findByText('AVGO')).toBeInTheDocument()
    expect(screen.getByText('CRM')).toBeInTheDocument()
    expect(screen.getByText(/contributions sum to the index return/)).toBeInTheDocument()
  })

  it('REFUSES a decomposition that does not reconcile (BU-29)', async () => {
    mount({ ...RECONCILING, reconciles: false, residual: 0.0012 })

    expect(await screen.findByText(/does not reconcile/)).toBeInTheDocument()
    // The table is withheld, not merely annotated: quoting a row from a
    // decomposition that misses its total would attribute a return the index
    // did not make.
    expect(screen.queryByText('AVGO')).not.toBeInTheDocument()
  })

  it('still reports the totals it can stand behind while refusing the table', async () => {
    mount({ ...RECONCILING, reconciles: false, residual: 0.0012 })

    await screen.findByText(/does not reconcile/)
    expect(screen.getByText('+14.2%')).toBeInTheDocument()
    expect(screen.getByText('0.1200%')).toBeInTheDocument()
  })

  it('distinguishes an uncapped index from one whose cap cost nothing', async () => {
    // py-beacon returns null rather than 0.0 precisely so these read
    // differently — 0.0 would claim capping happened and made no difference.
    mount({ ...RECONCILING, cap_drag: null })

    expect(await screen.findByText('uncapped')).toBeInTheDocument()
    expect(screen.getByText('no costs')).toBeInTheDocument()
  })

  it('does not open a Drilldown of its own', async () => {
    // Weights owns the constituent selection — Figma links Drilldown to that
    // pane (357:2319). A second pane setting the same subject would give the
    // user two places that both claim to drive one linked view.
    mount(RECONCILING)
    await userEvent.click(await screen.findByText('AVGO'))

    expect(
      useWorkspace.getState().tabs.filter((tab) => tab.viewKind === 'asset-drilldown')
    ).toHaveLength(0)
  })
})
