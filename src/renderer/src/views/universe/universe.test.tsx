import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BeaconClient } from '../../api/client'
import { ClientContext } from '../../api/queryClient'
import { useWorkspace } from '../../state/tabs.store'
import { UniverseView } from './UniverseView'
import { billions, buildRow, volume } from './universe'

describe('volume', () => {
  it('reads as an order of magnitude rather than a count', () => {
    expect(volume(4_182_000)).toBe('4.2M')
    expect(volume(950)).toBe('950')
    expect(volume(undefined)).toBe('—')
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

function mount(subject: string | undefined = 'US-LARGECAP'): Call[] {
  const calls: Call[] = []
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })

  const client = {
    universes: {
      // The engine sends each universe's whole membership with the row, which
      // is what makes the overview's counts free.
      list: () =>
        Promise.resolve({
          universes: [{ id: 'US-LARGECAP', name: 'US Large Cap', identifiers: IDENTIFIERS }]
        }),
      members: () => Promise.resolve({ universe_id: 'US-LARGECAP', identifiers: IDENTIFIERS })
    },
    data: {
      coverage: () =>
        Promise.resolve({
          datasets: [{ dataset: 'market', configured: true, end: '2026-08-19T00:00:00' }]
        }),
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
        <UniverseView tab={tab!} subject={subject} />
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

/*
 * These open ON a universe. Landing with no subject shows the overview
 * instead (BU-93), which is its own suite below — the view used to fall back
 * to `catalogue[0]` and these read as if it still did.
 */
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
 * A tab with no subject. Passed as `''` rather than `undefined`, which would
 * hit `mount`'s default parameter — the view maps both to the same thing
 * through `subject ?? ''`.
 */
function mountOverview(): Call[] {
  return mount('')
}

/** The overview table, since a universe name is also an option in the picker. */
function overview(): HTMLElement {
  const found = document.querySelector<HTMLElement>('.universe-overview')
  if (found === null) throw new Error('the overview did not render')
  return found
}

describe('opening with no universe chosen', () => {
  it('lists the universes rather than picking one', async () => {
    // It used to open on `catalogue[0]`, which on a real engine is the seeded
    // GLOBAL — five thousand rows of somebody else's universe, and nothing
    // anywhere answering "what universes do I have?".
    mountOverview()
    await screen.findByText(/1 universe/)

    expect(within(overview()).getByText('US Large Cap')).toBeInTheDocument()
    // No member table: no universe was selected.
    expect(screen.queryByText('T000')).toBeNull()
  })

  it('counts what is listed as of the latest date the data reaches', async () => {
    // Not the stored list length: a universe document outlives its members,
    // so "how many constituents" and "how long is the saved list" stop
    // agreeing the moment anything delists.
    mountOverview()
    await screen.findByText(/1 universe/)

    await waitFor(() => {
      expect(within(overview()).getByText(String(IDENTIFIERS.length))).toBeInTheDocument()
    })
    expect(within(overview()).getByText('2026-08-19')).toBeInTheDocument()
    expect(screen.getByText(/counted as of 2026-08-19/)).toBeInTheDocument()
  })

  it('asks once for every name, not once per universe', async () => {
    // Deduplicated across universes and chunked to the engine's cap, rather
    // than a call per universe — which is the fan-out #45 removed elsewhere.
    const calls = mountOverview()
    await screen.findByText(/1 universe/)

    await waitFor(() => {
      expect(calls).toHaveLength(1)
    })
    expect(calls[0]?.identifiers).toHaveLength(IDENTIFIERS.length)
  })

  it('opens a universe when its row is clicked', async () => {
    mountOverview()
    await screen.findByText(/1 universe/)
    await userEvent.click(within(overview()).getByText('US Large Cap'))

    expect(useWorkspace.getState().tabs[0]?.subject).toBe('US-LARGECAP')
  })

  it('offers a way back, since the picker is the only route out of a universe', async () => {
    mount()
    await screen.findByText('T000')

    const options = within(screen.getByLabelText('Universe'))
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(options).toContain('All universes')
  })

  it('hides the as-of field, which has no membership to date', async () => {
    mountOverview()
    await screen.findByText(/1 universe/)

    expect(screen.queryByLabelText('As of')).toBeNull()
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
            { id: 'US-LARGECAP', name: 'US Large Cap', identifiers: ['ZZZ1', 'ZZZ2'] },
            {
              id: 'GLOBAL',
              name: 'GLOBAL',
              source: 'seeded',
              identifiers: POOL.map((entry) => entry.identifier)
            }
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

  // The values control is a checkbox dropdown (BU-91), so open it, tick, and
  // dismiss — a panel left open would sit over whatever the test looks at next.
  await userEvent.click(within(editor).getByRole('button', { name: `Row ${number} values` }))
  for (const value of values) {
    await userEvent.click(within(editor).getByRole('checkbox', { name: value }))
  }
  await userEvent.keyboard('{Escape}')
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

/**
 * Point in time (BU-92).
 *
 * A universe outlives its members. The engine answers `found: false` for a
 * name whose reference row is not valid on the requested date, and the view
 * must read that as "not listed then" rather than "no data".
 */
const LISTED_LATE = 'BBB'

function mountPointInTime(): { dates: (string | undefined)[] } {
  const dates: (string | undefined)[] = []
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })

  const client = {
    universes: {
      list: () =>
        Promise.resolve({
          universes: [{ id: 'HIST', name: 'Historic', identifiers: ['AAA', LISTED_LATE] }]
        }),
      members: () => Promise.resolve({ universe_id: 'HIST', identifiers: ['AAA', LISTED_LATE] })
    },
    data: {
      referenceBatch: (
        identifiers: readonly string[],
        _fields: readonly string[] | undefined,
        date: string | undefined
      ) => {
        dates.push(date)
        return Promise.resolve({
          as_of: date ?? '2026-08-04',
          entries: identifiers.map((id) => {
            const listed = date === undefined || date === '' || id !== LISTED_LATE
            return {
              identifier: id,
              found: listed,
              fields: listed ? { NAME: `${id} Corp`, SECTOR: 'Energy' } : null
            }
          })
        })
      }
    }
  } as unknown as BeaconClient

  const tab = useWorkspace.getState().tabs[0]
  render(
    <QueryClientProvider client={queries}>
      <ClientContext.Provider value={client}>
        <UniverseView tab={tab!} subject="HIST" />
      </ClientContext.Provider>
    </QueryClientProvider>
  )
  return { dates }
}

describe('a universe as it stood on a date', () => {
  it('asks for today until a date is set, so nothing changes by default', async () => {
    const { dates } = mountPointInTime()
    await screen.findByText('AAA')

    expect(dates).toEqual([''])
    expect(screen.getByText(LISTED_LATE)).toBeInTheDocument()
    expect(screen.getByText('2 assets', { exact: false })).toBeInTheDocument()
  })

  it('passes the date to the engine rather than filtering here', async () => {
    // py-beacon owns what "valid then" means; a second implementation off
    // DATE_FROM and DATE_TO would be one more thing to keep in step.
    const { dates } = mountPointInTime()
    await screen.findByText('AAA')

    await userEvent.type(screen.getByLabelText('As of'), '2018-01-02')
    await waitFor(() => {
      expect(dates).toContain('2018-01-02')
    })
  })

  it('drops a name that was not listed then, rather than drawing it blank', async () => {
    const { dates } = mountPointInTime()
    await screen.findByText('AAA')
    await userEvent.type(screen.getByLabelText('As of'), '2018-01-02')

    await waitFor(() => {
      expect(dates).toContain('2018-01-02')
    })
    await waitFor(() => {
      expect(screen.queryByText(LISTED_LATE)).toBeNull()
    })
    expect(screen.getByText('AAA')).toBeInTheDocument()
  })

  it('says how many of the stored members were not listed then', async () => {
    // "512 assets" and "487 assets as of 2021-03-31" are different claims.
    mountPointInTime()
    await screen.findByText('AAA')
    await userEvent.type(screen.getByLabelText('As of'), '2018-01-02')

    await waitFor(() => {
      expect(screen.getByText(/as of 2018-01-02/)).toBeInTheDocument()
    })
    expect(screen.getByText(/1 of the stored 2 were not listed then/)).toBeInTheDocument()
  })
})

describe('a universe past the engine cap', () => {
  const MANY = Array.from({ length: 2_400 }, (_, i) => `B${String(i).padStart(4, '0')}`)

  function mountBig(): Call[] {
    const calls: Call[] = []
    const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })

    const client = {
      universes: {
        list: () => Promise.resolve({ universes: [{ id: 'BIG', name: 'Big', identifiers: MANY }] }),
        members: () => Promise.resolve({ universe_id: 'BIG', identifiers: MANY })
      },
      data: {
        coverage: () =>
          Promise.resolve({
            datasets: [{ dataset: 'market', configured: true, end: '2026-08-20' }]
          }),
        referenceBatch: (identifiers: readonly string[], fields: readonly string[] | undefined) => {
          calls.push({ identifiers, fields })
          return Promise.resolve({
            as_of: '2026-08-20',
            entries: identifiers.map((id) => ({
              identifier: id,
              found: true,
              fields: { NAME: `${id} Corp` }
            }))
          })
        }
      }
    } as unknown as BeaconClient

    const tab = useWorkspace.getState().tabs[0]
    render(
      <QueryClientProvider client={queries}>
        <ClientContext.Provider value={client}>
          <UniverseView tab={tab!} subject="BIG" />
        </ClientContext.Provider>
      </QueryClientProvider>
    )
    return calls
  }

  /** The virtualiser draws no rows for 2,400 items in jsdom, so read the
   *  footnote, which is the figure this is about anyway. */
  function footnote(): string {
    return document.querySelector('.universe-footnote')?.textContent ?? ''
  }

  it('asks about every member, in calls of the cap', async () => {
    // 2,400 names is three calls, not one truncated to 1,000.
    const calls = mountBig()

    await waitFor(() => {
      expect(calls).toHaveLength(3)
    })
    const asked = calls.flatMap((call) => [...call.identifiers])
    expect(new Set(asked).size).toBe(MANY.length)
    expect(calls.every((call) => call.identifiers.length <= 1_000)).toBe(true)
  })

  it('counts all of them, where it used to count the first thousand', async () => {
    // The bug behind "757 assets" against an overview saying 3,849: the same
    // proportion, measured on a fifth of the population.
    mountBig()

    await waitFor(() => {
      expect(footnote()).toContain('2,400 assets')
    })
    // A client limitation that was described as an engine one.
    expect(footnote()).not.toContain('detail for the first')
  })
})

describe('getting back to the list', () => {
  it('clears the tab’s subject through the picker, not a second control', async () => {
    // #103 removed the back arrow: the picker already carried "All universes"
    // and two routes to one place was one too many in a crowded header.
    mount()
    await screen.findByText('T000')

    await userEvent.selectOptions(screen.getByLabelText('Universe'), '')

    // The tab is the contract. Re-rendering on it is PaneHost's job — this
    // harness passes `subject` as a fixed prop, so nothing here would change.
    expect(useWorkspace.getState().tabs[0]?.subject).toBe('')
  })
})
