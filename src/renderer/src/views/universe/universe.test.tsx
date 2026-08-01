import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BeaconClient } from '../../api/client'
import { ClientContext } from '../../api/queryClient'
import { useWorkspace } from '../../state/tabs.store'
import { UniverseView } from './UniverseView'
import { DETAIL_LIMIT, billions, buildRow } from './universe'

describe('buildRow', () => {
  it('reads reference fields case-insensitively', () => {
    const row = buildRow(
      'AAPL',
      1,
      { NAME: 'Apple Inc.', GICS_Sector: 'Information Technology' },
      true
    )

    expect(row.name).toBe('Apple Inc.')
    expect(row.sector).toBe('Information Technology')
  })

  it('prefers free-float market cap over plain market cap', () => {
    // The design's column is "FF Mkt Cap"; plain market cap is the fallback,
    // not the intent.
    const row = buildRow('AAPL', 1, { free_float_market_cap: 2e12, market_cap: 3e12 }, true)
    expect(row.marketCap).toBe(2e12)
  })

  it('says nothing rather than zero for a row whose detail was never asked for', () => {
    const row = buildRow('ZZZZ', 900, undefined, false)

    expect(row.name).toBeUndefined()
    expect(row.marketCap).toBeUndefined()
    expect(row.detailed).toBe(false)
  })
})

describe('billions', () => {
  it('reports market cap in $bn, as the column header says', () => {
    expect(billions(3.16e12)).toBe('3,160')
    expect(billions(undefined)).toBe('—')
  })
})

const IDENTIFIERS = Array.from(
  { length: DETAIL_LIMIT + 5 },
  (_, i) => `T${String(i).padStart(3, '0')}`
)

function mount(): string[] {
  const asked: string[] = []
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })

  const client = {
    universes: {
      list: () => Promise.resolve({ universes: [{ id: 'US-LARGECAP', name: 'US Large Cap' }] }),
      members: () => Promise.resolve({ universe_id: 'US-LARGECAP', identifiers: IDENTIFIERS })
    },
    data: {
      reference: (id: string) => {
        asked.push(id)
        return Promise.resolve({ identifier: id, fields: { name: `${id} Corp` } })
      }
    }
  } as unknown as BeaconClient

  const tab = useWorkspace.getState().tabs[0]
  render(
    <QueryClientProvider client={queries}>
      <ClientContext.Provider value={client}>
        <UniverseView tab={tab!} subject={undefined} />
      </ClientContext.Provider>
    </QueryClientProvider>
  )
  return asked
}

beforeEach(() => {
  localStorage.clear()
  const store = useWorkspace.getState()
  store.reset()
  store.openTab({
    id: 'universe',
    page: 'strategy-builder',
    viewKind: 'universe-set',
    archetype: 'query',
    title: 'Universe Set'
  })
})

describe('UniverseView', () => {
  it('lists every member, not only the ones it has detail for', async () => {
    mount()
    await screen.findByText('T000')

    expect(
      screen.getByText(`${String(IDENTIFIERS.length)} assets`, { exact: false })
    ).toBeInTheDocument()
  })

  it('bounds the reference fan-out and says so', async () => {
    // py-beacon has no batch reference endpoint, so a 512-name universe would
    // otherwise be 512 requests.
    const asked = mount()
    await screen.findByText('T000')

    expect(asked.length).toBeLessThanOrEqual(DETAIL_LIMIT)
    expect(screen.getByText(/detail shown for the first 60/)).toBeInTheDocument()
  })

  it('opens Reference Data for a clicked row', async () => {
    mount()
    await userEvent.click(await screen.findByText('T000'))

    const tabs = useWorkspace.getState().tabs
    const opened = tabs.find((tab) => tab.viewKind === 'reference-data')
    expect(opened?.subject).toBe('T000')
    // Reference Data lives on Data Explorer, not here.
    expect(opened?.page).toBe('data-explorer')
  })

  it('records the chosen universe on the tab, so the choice survives a switch', async () => {
    mount()
    await screen.findByText('T000')

    await userEvent.selectOptions(screen.getByLabelText('Universe'), 'US-LARGECAP')
    expect(useWorkspace.getState().tabs[0]?.subject).toBe('US-LARGECAP')
  })
})
