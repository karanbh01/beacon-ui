import { render, screen, within } from '@testing-library/react'
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

/**
 * The builder (BU-85).
 *
 * Its pool is the SEEDED universe, which is py-beacon's own copy of the loaded
 * dataset — deliberately not the one on screen, so these tests would catch the
 * builder quietly filtering over whatever universe happened to be selected.
 */
const POOL = [
  { identifier: 'AAA', sector: 'Technology', exchange: 'XNAS', adv: 5_000_000 },
  { identifier: 'BBB', sector: 'Technology', exchange: 'XLON', adv: 1_000_000 },
  { identifier: 'CCC', sector: 'Energy', exchange: 'XNAS', adv: 3_000_000 }
]

interface Created {
  name: string
  identifiers: string[]
}

function mountBuilder(): Created[] {
  const created: Created[] = []
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })

  const client = {
    universes: {
      list: () =>
        Promise.resolve({
          universes: [
            { id: 'US-LARGECAP', name: 'US Large Cap' },
            { id: 'GLOBAL', name: 'GLOBAL', source: 'seeded' }
          ]
        }),
      members: (id: string) =>
        Promise.resolve({
          universe_id: id,
          identifiers: id === 'GLOBAL' ? POOL.map((entry) => entry.identifier) : ['ZZZ1', 'ZZZ2']
        }),
      create: (body: { name: string; identifiers: string[] }) => {
        created.push({ name: body.name, identifiers: body.identifiers })
        return Promise.resolve({ id: 'MINE', name: body.name })
      }
    },
    data: {
      referenceBatch: (identifiers: readonly string[]) =>
        Promise.resolve({
          as_of: '2026-08-04',
          entries: identifiers.map((id) => {
            const entry = POOL.find((candidate) => candidate.identifier === id)
            return {
              identifier: id,
              found: true,
              fields: {
                NAME: `${id} Corp`,
                SECTOR: entry?.sector ?? 'Financials',
                EXCHANGE: entry?.exchange ?? 'XETR',
                adv_3m: entry?.adv ?? 100
              }
            }
          })
        })
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
  return created
}

async function openBuilder(): Promise<{ editor: HTMLElement; created: Created[] }> {
  const created = mountBuilder()
  await userEvent.click(await screen.findByRole('button', { name: 'New universe…' }))
  await screen.findByText('New universe')

  // Scoped to the card: the view's own table is on screen behind it.
  const editor = document.querySelector<HTMLElement>('.universe-editor')
  if (editor === null) throw new Error('the builder did not render')
  return { editor, created }
}

/** Add a filter row and fill it in, as the user would. */
async function addFilter(editor: HTMLElement, dimension: string, values: string[]): Promise<void> {
  const before = within(editor).queryAllByLabelText(/^Row \d+ dimension$/).length
  await userEvent.click(within(editor).getByRole('button', { name: /Add filter/ }))

  const number = String(before + 1).padStart(2, '0')
  await userEvent.selectOptions(
    await within(editor).findByLabelText(`Row ${number} dimension`),
    dimension
  )
  await userEvent.selectOptions(within(editor).getByLabelText(`Row ${number} values`), values)
}

describe('the universe builder', () => {
  it('opens with no filters at all, just a slot to add one', async () => {
    // The panel this replaced drew every dimension at once: seven fieldsets
    // and 67 checkboxes before the user had said anything.
    const { editor } = await openBuilder()
    await within(editor).findByRole('button', { name: /Add filter/ })

    expect(within(editor).queryAllByLabelText(/^Row \d+ dimension$/)).toHaveLength(0)
    expect(within(editor).queryByText(/pass/)).toBeNull()
  })

  it('offers a dimension per reference column, not a hard-coded five', async () => {
    // Region, country and market cap are whatever the engine returns. The
    // controls are generated, so this also proves the reference batch was not
    // rejected — an unknown column is a hard 422 and would leave none at all.
    const { editor } = await openBuilder()
    await userEvent.click(await within(editor).findByRole('button', { name: /Add filter/ }))

    const options = within(within(editor).getByLabelText('Row 01 dimension'))
      .getAllByRole('option')
      .map((option) => option.textContent)

    expect(options).toContain('Sector')
    expect(options).toContain('Adv 3m')
    // An identity, not a dimension.
    expect(options).not.toContain('Name')
  })

  it('shows what a row left behind, on the row', async () => {
    const { editor } = await openBuilder()
    await addFilter(editor, 'SECTOR', ['Technology'])

    expect(within(editor).getByText('2 pass')).toBeInTheDocument()
    expect(within(editor).getByText('Sector is Technology')).toBeInTheDocument()
  })

  it('narrows again on a second row, and says so', async () => {
    // The whole reason the count is per row rather than one total at the top:
    // 5,000 narrowed to 12 is either three sensible filters or one mistake.
    const { editor } = await openBuilder()
    await addFilter(editor, 'SECTOR', ['Technology'])
    await addFilter(editor, 'EXCHANGE', ['XNAS'])

    expect(within(editor).getByText('2 pass')).toBeInTheDocument()
    expect(within(editor).getByText('1 pass')).toBeInTheDocument()
  })

  it('restores the count beneath a row that is removed', async () => {
    const { editor } = await openBuilder()
    await addFilter(editor, 'SECTOR', ['Technology'])
    await addFilter(editor, 'EXCHANGE', ['XNAS'])
    await userEvent.click(within(editor).getByRole('button', { name: 'Remove row 01' }))

    // The exchange row now sees the whole pool rather than the sector's half,
    // so CCC comes back and the count goes UP.
    expect(within(editor).getByText('Exchange is XNAS')).toBeInTheDocument()
    expect(within(editor).getByText('2 pass')).toBeInTheDocument()
    expect(within(editor).queryByText('1 pass')).toBeNull()
  })

  it('previews the matched names as a table, before anything is saved', async () => {
    const { editor } = await openBuilder()
    await addFilter(editor, 'SECTOR', ['Technology'])

    expect(within(editor).getByText('AAA Corp')).toBeInTheDocument()
    expect(within(editor).getByText('BBB Corp')).toBeInTheDocument()
    expect(within(editor).queryByText('CCC Corp')).toBeNull()
    expect(within(editor).getByText(/2 members/)).toBeInTheDocument()
  })

  it('says whether a hand-typed ticker is in the dataset', async () => {
    // The whole of "I cannot even confirm the ticker I added is validated" —
    // the engine refuses an unknown member, and finding that out at save time
    // for one name out of forty is no use.
    const { editor } = await openBuilder()
    await within(editor).findByRole('button', { name: /Add filter/ })

    await userEvent.type(within(editor).getByLabelText('Paste identifiers'), 'CCC, NOPE')
    await userEvent.click(within(editor).getByRole('button', { name: 'Add pasted' }))

    expect(within(editor).getByText(/1 added by hand, found in the dataset/)).toBeInTheDocument()
    expect(within(editor).getByText(/not in the dataset: NOPE/)).toBeInTheDocument()
  })

  it('saves the matched names and the hand-added ones together', async () => {
    const { editor, created } = await openBuilder()

    await addFilter(editor, 'SECTOR', ['Energy'])
    await userEvent.type(within(editor).getByLabelText('Universe name'), 'Mine')
    await userEvent.type(within(editor).getByLabelText('Paste identifiers'), 'AAA')
    await userEvent.click(within(editor).getByRole('button', { name: 'Add pasted' }))
    await userEvent.click(within(editor).getByRole('button', { name: 'Create universe' }))

    expect(created).toHaveLength(1)
    expect(created[0]?.identifiers).toEqual(['CCC', 'AAA'])
  })

  it('applies a rank where the user put it, not always last', async () => {
    const { editor } = await openBuilder()
    await addFilter(editor, 'SECTOR', ['Technology'])

    await userEvent.click(within(editor).getByRole('button', { name: /Add rank/ }))
    await userEvent.selectOptions(within(editor).getByLabelText('Row 02 dimension'), 'adv_3m')
    await userEvent.type(within(editor).getByLabelText('Row 02 count'), '1')

    // AAA out-trades BBB, and CCC out-trades BBB too — but the sector row ran
    // first, so CCC was never a candidate.
    expect(within(editor).getByText('AAA Corp')).toBeInTheDocument()
    expect(within(editor).queryByText('BBB Corp')).toBeNull()
    expect(within(editor).queryByText('CCC Corp')).toBeNull()
  })
})
