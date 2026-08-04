import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BeaconClient } from '../../api/client'
import { ClientContext } from '../../api/queryClient'
import { useWorkspace } from '../../state/tabs.store'
import { UniverseView } from './UniverseView'
import { billions, buildRow, fieldsByIdentifier, volume } from './universe'

describe('volume', () => {
  it('reads as an order of magnitude rather than a count', () => {
    expect(volume(4_182_000)).toBe('4.2M')
    expect(volume(950)).toBe('950')
    expect(volume(undefined)).toBe('—')
  })
})

describe('fieldsByIdentifier', () => {
  it('treats a not-found entry as having no detail', () => {
    // `found: false` is the engine saying it has no reference row, which is
    // different from the client not having asked.
    const map = fieldsByIdentifier([
      { identifier: 'A', found: true, fields: { name: 'Alpha' } },
      { identifier: 'B', found: false, fields: null }
    ])

    expect(map.get('A')).toEqual({ name: 'Alpha' })
    expect(map.get('B')).toBeUndefined()
  })
})

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

// Comfortably past the 60 the old fan-out stopped at.
const IDENTIFIERS = Array.from({ length: 200 }, (_, i) => `T${String(i).padStart(3, '0')}`)

interface Call {
  identifiers: readonly string[]
  fields: readonly string[] | undefined
}

function mount(): Call[] {
  const calls: Call[] = []
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })

  const client = {
    universes: {
      list: () => Promise.resolve({ universes: [{ id: 'US-LARGECAP', name: 'US Large Cap' }] }),
      members: () => Promise.resolve({ universe_id: 'US-LARGECAP', identifiers: IDENTIFIERS })
    },
    data: {
      referenceBatch: (identifiers: readonly string[], fields: readonly string[] | undefined) => {
        calls.push({ identifiers, fields })
        return Promise.resolve({
          as_of: '2026-08-04',
          entries: identifiers.map((id) => ({
            identifier: id,
            found: true,
            fields: { name: `${id} Corp`, gics_sector: 'Technology', adv_3m: 4_182_000 }
          }))
        })
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
  return calls
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

  it('fetches every name in ONE request, not one per name', async () => {
    // This is the whole of #45. The table used to fan out a call per
    // identifier and stop at 60, filling the rest with dashes.
    const calls = mount()
    await screen.findByText('T000')

    expect(calls).toHaveLength(1)
    expect(calls[0]?.identifiers).toHaveLength(IDENTIFIERS.length)
    expect(screen.queryByText(/detail shown for the first/)).toBeNull()
  })

  it('asks for adv_3m by name, because it is derived', async () => {
    // The endpoint returns stored columns by default, so a request that did
    // not name it would come back without it however many identifiers it
    // carried — the fan-out was never the only reason ADV was missing.
    const calls = mount()
    await screen.findByText('T000')

    expect(calls[0]?.fields).toContain('adv_3m')
  })

  it('fills the detail columns past where the old cap was', async () => {
    mount()
    await screen.findByText('T100 Corp')

    expect(screen.getAllByText('4.2M').length).toBeGreaterThan(0)
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
