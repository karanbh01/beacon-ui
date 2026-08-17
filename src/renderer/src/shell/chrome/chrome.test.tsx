import { render, screen } from '@testing-library/react'
import { WithQueries } from '../../../../test/queries'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LAYOUT_OPTIONS, useChrome } from '../../state/chrome'
import { useWorkspace } from '../../state/tabs.store'
import { sourceRows } from './dataSources'
import { LayoutMenu } from './LayoutMenu'
import { fittingAlign, leftEdge } from './popoverAlign'
import { MenuBar } from '../MenuBar'
import { nextIndex } from '../../components/Typeahead/useTypeahead'
import { groupRows, recentRows, searchRows } from './searchResults'
import type { ViewOption } from '../viewRegistry'
import type { Tab } from '../../state/tabs.types'

const TABS: Tab[] = [
  {
    id: 't1',
    page: 'data-explorer',
    pane: 0,
    viewKind: 'prices',
    archetype: 'query',
    title: 'Prices',
    subject: 'AAPL',
    dirty: false
  },
  {
    id: 't2',
    page: 'strategy-builder',
    pane: 0,
    viewKind: 'weights',
    archetype: 'pinned',
    title: 'Weights',
    pinnedDoc: 'TECH10',
    dirty: false
  }
]

describe('searchRows', () => {
  it('says nothing until something is typed', () => {
    // Open-on-type means the panel is a function of the query. An empty
    // query producing rows would leave it hanging open over the pane.
    expect(searchRows('', TABS)).toEqual([])
    expect(searchRows('   ', TABS)).toEqual([])
  })

  it('matches a tab by title, subject or pinned document', () => {
    expect(searchRows('pric', TABS).map((r) => r.label)).toContain('Prices')
    expect(searchRows('aapl', TABS).map((r) => r.label)).toContain('Prices')
    expect(searchRows('tech10', TABS).map((r) => r.label)).toContain('Weights')
  })

  it('always offers the action, even when nothing matches', () => {
    // A query with no results still has somewhere to go; an empty panel
    // would be a dead end.
    const rows = searchRows('zzzz', TABS)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.kind).toBe('action')
    expect(rows[0]?.label).toContain('zzzz')
  })

  it('groups consecutive rows under one heading', () => {
    const groups = groupRows(searchRows('e', TABS))
    expect(groups.map((g) => g.group)).toEqual(['OPEN TABS', 'ACTIONS'])
  })
})

describe('nextIndex', () => {
  it('wraps at both ends', () => {
    expect(nextIndex(-1, 1, 3)).toBe(0)
    expect(nextIndex(2, 1, 3)).toBe(0)
    expect(nextIndex(0, -1, 3)).toBe(2)
  })

  it('reports nothing to highlight in an empty list', () => {
    expect(nextIndex(0, 1, 0)).toBe(-1)
  })
})

describe('sourceRows', () => {
  it('follows the engine for the local store', () => {
    expect(sourceRows('connected')[1]).toMatchObject({ name: 'Local Store', status: 'connected' })
    expect(sourceRows('stopped')[1]).toMatchObject({ name: 'Local Store', status: 'unavailable' })
  })

  it('does not claim an upstream provider is connected', () => {
    // The frame shows Yahoo Finance connected. It cannot be — a spawned
    // server has no way to acquire a data source (#40) — and a panel that
    // says otherwise is worse than one that says nothing.
    const upstream = sourceRows('connected').filter((row) => row.name !== 'Local Store')
    expect(upstream.every((row) => row.status === 'not configured')).toBe(true)
  })
})

describe('LayoutMenu', () => {
  it('renders every option as one radio group', () => {
    render(<LayoutMenu open onClose={vi.fn()} value="single" onSelect={vi.fn()} />)

    const options = screen.getAllByRole('radio')
    expect(options).toHaveLength(LAYOUT_OPTIONS.length)
    expect(options[0]).toBeChecked()
  })

  it('reports the choice and closes', async () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<LayoutMenu open onClose={onClose} value="single" onSelect={onSelect} />)

    await user.click(screen.getByRole('radio', { name: 'Four panes' }))

    expect(onSelect).toHaveBeenCalledWith('grid')
    expect(onClose).toHaveBeenCalled()
  })

  it('renders nothing when closed', () => {
    render(<LayoutMenu open={false} onClose={vi.fn()} value="single" onSelect={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('chrome popovers in the bar', () => {
  beforeEach(() => {
    useChrome.setState({ layoutByPage: { 'data-explorer': 'single' } })
    useWorkspace.setState({ tabs: TABS, activeByPane: {}, closed: [] })
  })

  it('opens the data sources panel and closes it on Escape', async () => {
    const user = userEvent.setup()
    render(
      <WithQueries>
        <MenuBar engine="connected" />
      </WithQueries>
    )

    await user.click(screen.getByRole('button', { name: 'Data sources' }))
    expect(screen.getByRole('dialog', { name: 'Data sources' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Data sources' })).toBeNull()
  })

  it('keeps only one panel open at a time', async () => {
    const user = userEvent.setup()
    render(
      <WithQueries>
        <MenuBar engine="connected" />
      </WithQueries>
    )

    await user.click(screen.getByRole('button', { name: 'Data sources' }))
    await user.click(screen.getByRole('button', { name: 'Layout' }))

    expect(screen.getByRole('dialog', { name: 'Layout' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Data sources' })).toBeNull()
  })

  it('closes a panel by clicking its own trigger again', async () => {
    const user = userEvent.setup()
    render(
      <WithQueries>
        <MenuBar engine="connected" />
      </WithQueries>
    )
    const trigger = screen.getByRole('button', { name: 'Layout' })

    await user.click(trigger)
    await user.click(trigger)

    expect(screen.queryByRole('dialog', { name: 'Layout' })).toBeNull()
  })

  it('persists the layout choice through the store', async () => {
    const user = userEvent.setup()
    render(
      <WithQueries>
        <MenuBar engine="connected" page="data-explorer" />
      </WithQueries>
    )

    await user.click(screen.getByRole('button', { name: 'Layout' }))
    await user.click(screen.getByRole('radio', { name: 'Two columns' }))

    // The bar writes the layout for the page it was given (BU-75).
    expect(useChrome.getState().layoutByPage['data-explorer']).toBe('columns')
  })
})

describe('chrome search', () => {
  beforeEach(() => {
    useWorkspace.setState({ tabs: TABS, activeByPane: {}, closed: [] })
  })

  it('opens on the first character, not on submit', async () => {
    const user = userEvent.setup()
    render(
      <WithQueries>
        <MenuBar engine="connected" />
      </WithQueries>
    )

    expect(screen.queryByRole('listbox')).toBeNull()
    await user.type(screen.getByRole('combobox', { name: 'Search' }), 'p')

    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('closes on Escape and reopens when typing continues', async () => {
    const user = userEvent.setup()
    render(
      <WithQueries>
        <MenuBar engine="connected" />
      </WithQueries>
    )
    const input = screen.getByRole('combobox', { name: 'Search' })

    await user.type(input, 'pr')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()

    await user.type(input, 'i')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('walks the rows with the arrow keys and opens one on Enter', async () => {
    const onSelectTab = vi.fn()
    const user = userEvent.setup()
    render(
      <WithQueries>
        <MenuBar engine="connected" onSelectTab={onSelectTab} />
      </WithQueries>
    )

    await user.type(screen.getByRole('combobox', { name: 'Search' }), 'prices')
    await user.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Enter}')
    expect(onSelectTab).toHaveBeenCalledWith('t1')
  })

  it('treats Enter with nothing highlighted as a plain submit', async () => {
    const onSearch = vi.fn()
    const user = userEvent.setup()
    render(
      <WithQueries>
        <MenuBar engine="connected" onSearch={onSearch} />
      </WithQueries>
    )

    await user.type(screen.getByRole('combobox', { name: 'Search' }), 'anything{Enter}')

    expect(onSearch).toHaveBeenCalledWith('anything')
  })

  it('clears the query once a row is taken', async () => {
    const user = userEvent.setup()
    render(
      <WithQueries>
        <MenuBar engine="connected" onSelectTab={vi.fn()} />
      </WithQueries>
    )
    const input = screen.getByRole('combobox', { name: 'Search' })

    await user.type(input, 'prices')
    await user.keyboard('{ArrowDown}{Enter}')

    expect(input).toHaveValue('')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

describe('fittingAlign', () => {
  const WIDE = 1440
  // The `+` on an empty tab strip, and the same button after six tabs.
  const EMPTY = { left: 58, right: 92 }
  const CROWDED = { left: 1300, right: 1334 }

  it('sits beside the + when there is room to its right', () => {
    expect(fittingAlign('start', 'beside', EMPTY, 220, WIDE)).toBe('start')
  })

  it('flips to the other side once the + has walked too far right', () => {
    // A measurement, not a breakpoint: how far it has travelled depends on
    // how many tabs are open and how wide their labels ran.
    expect(fittingAlign('start', 'beside', CROWDED, 220, WIDE)).toBe('end')
  })

  it('stays put when neither side fits, rather than swapping to a worse one', () => {
    expect(fittingAlign('start', 'beside', { left: 700, right: 734 }, 1400, WIDE)).toBe('start')
  })

  it('leaves a right-aligned menu-bar panel in the corner it belongs in', () => {
    expect(fittingAlign('end', 'below', { left: 1200, right: 1234 }, 260, WIDE)).toBe('end')
  })

  it('flips a right-aligned panel that would run off the left', () => {
    expect(fittingAlign('end', 'below', { left: 20, right: 54 }, 260, WIDE)).toBe('start')
  })
})

describe('leftEdge', () => {
  it('places a beside panel past the trigger, and a below panel over it', () => {
    // The distinction that makes the fit check correct: `beside` starts where
    // the trigger ends, `below` starts where it starts.
    const anchor = { left: 100, right: 134 }

    expect(leftEdge('start', 'beside', anchor, 220)).toBe(134)
    expect(leftEdge('start', 'below', anchor, 220)).toBe(100)
    expect(leftEdge('end', 'beside', anchor, 220)).toBe(-120)
    expect(leftEdge('end', 'below', anchor, 220)).toBe(-86)
  })
})

describe('searchRows with identifiers (BU-72)', () => {
  const FOUND = [
    { identifier: 'CMP020', name: 'CMP020 Corporation' },
    { identifier: 'CMP021', name: 'CMP021 Corporation' }
  ]

  it('offers identifiers under their own heading', () => {
    const groups = groupRows(searchRows('cmp02', TABS, { identifiers: FOUND }))
    expect(groups.map((g) => g.group)).toEqual(['ASSETS', 'ACTIONS'])
  })

  it('puts open tabs above identifiers — what you have beats what you could open', () => {
    const groups = groupRows(searchRows('aapl', TABS, { identifiers: FOUND }))
    expect(groups[0]?.group).toBe('OPEN TABS')
  })

  it('keeps the order the engine ranked them in', () => {
    const backwards = [{ identifier: 'ZZZ' }, { identifier: 'AAA' }]
    const rows = searchRows('z', TABS, { identifiers: backwards }).filter(
      (row) => row.kind === 'identifier'
    )
    expect(rows.map((row) => row.label)).toEqual(['ZZZ', 'AAA'])
  })

  it('does not repeat a symbol that is already an open tab', () => {
    // TABS has a Prices tab on AAPL. The same symbol under two headings reads
    // as a bug, not as two routes to it.
    const rows = searchRows('aapl', TABS, {
      identifiers: [{ identifier: 'AAPL', name: 'Apple Inc.' }]
    })
    expect(rows.filter((row) => row.kind === 'identifier')).toHaveLength(0)
  })

  it('caps identifiers on their own count, not against the whole panel', () => {
    // With nothing matching in OPEN TABS a shared budget let the whole limit
    // through as assets, and the dropdown became a page.
    const many = Array.from({ length: 12 }, (_, i) => ({ identifier: `SYM${String(i)}` }))
    const rows = searchRows('sym', TABS, { identifiers: many }).filter(
      (row) => row.kind === 'identifier'
    )
    expect(rows).toHaveLength(5)
  })

  it('carries the subject to open on the row', () => {
    const row = searchRows('cmp02', TABS, { identifiers: FOUND }).find(
      (entry) => entry.kind === 'identifier'
    )
    expect(row?.subject).toBe('CMP020')
  })

  it('still works with no engine, offering tabs and the action alone', () => {
    const groups = groupRows(searchRows('cmp02', TABS))
    expect(groups.map((g) => g.group)).toEqual(['ACTIONS'])
  })
})

describe('the command palette (BU-79)', () => {
  const VIEWS: ViewOption[] = [
    { viewKind: 'frontier', page: 'optimiser', title: 'Frontier', archetype: 'pinned' },
    { viewKind: 'backtest', page: 'strategy-builder', title: 'Backtest', archetype: 'pinned' },
    { viewKind: 'coverage', page: 'data-explorer', title: 'Data Coverage', archetype: 'global' }
  ]
  const INDICES = [
    { id: 'TECH10', name: 'Beacon US Technology Top 10' },
    { id: 'ESG50', name: 'Beacon ESG 50' }
  ]

  it('offers indices from the engine catalogue', () => {
    // The group's own comment used to say there was nothing behind it. That
    // was true of the client: GET /indices existed all along.
    const rows = searchRows('tech', TABS, { indices: INDICES })
    const index = rows.find((row) => row.kind === 'index')

    expect(index?.label).toBe('TECH10')
    expect(index?.subject).toBe('TECH10')
    expect(index?.group).toBe('INDICES')
  })

  it('matches an index on its name as well as its id', () => {
    // "technology" appears only in the name, never in the id.
    const byName = searchRows('technology', TABS, { indices: INDICES })
    expect(byName.find((row) => row.kind === 'index')?.subject).toBe('TECH10')

    const byId = searchRows('esg50', TABS, { indices: INDICES })
    expect(byId.find((row) => row.kind === 'index')?.subject).toBe('ESG50')
  })

  it('marks an index that is open with unsaved changes', () => {
    const rows = searchRows('tech', TABS, {
      indices: [{ id: 'TECH10', name: 'x', dirty: true }]
    })
    expect(rows.find((row) => row.kind === 'index')?.label).toContain('•')
  })

  it('opens a view by name', () => {
    const rows = searchRows('frontier', TABS, { views: VIEWS })
    const view = rows.find((row) => row.kind === 'view')

    expect(view?.label).toBe('Frontier')
    expect(view?.view?.page).toBe('optimiser')
    expect(view?.subject).toBeUndefined()
  })

  it('reads an intent in both orders, above the plain groups', () => {
    const forward = searchRows('backtest TECH10', TABS, { views: VIEWS })
    const first = forward[0]
    expect(first?.kind).toBe('view')
    expect(first?.subject).toBe('TECH10')
    expect(first?.view?.viewKind).toBe('backtest')

    const reverse = searchRows('TECH10 backtest', TABS, { views: VIEWS })
    expect(reverse[0]?.subject).toBe('TECH10')
  })

  it('degrades to the plain groups when no half names a view', () => {
    // "MSFT" is a fine thing to type; it is just not an intent. Not AAPL —
    // that is already a tab subject here, so it is deduped out of ASSETS.
    const rows = searchRows('MSFT', TABS, {
      views: VIEWS,
      identifiers: [{ identifier: 'MSFT', name: 'Microsoft' }]
    })

    expect(rows.every((row) => row.kind !== 'view')).toBe(true)
    expect(rows.some((row) => row.kind === 'identifier')).toBe(true)
  })

  it('puts open tabs above everything, because you already have them', () => {
    const rows = searchRows('prices', TABS, { views: VIEWS, indices: INDICES })
    expect(rows[0]?.kind).toBe('tab')
  })

  it('caps each group so the panel stays a panel', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `IDX${String(i)}`, name: 'x' }))
    const rows = searchRows('idx', TABS, { indices: many })

    expect(rows.filter((row) => row.kind === 'index')).toHaveLength(4)
  })
})

describe('recentRows', () => {
  it('offers the workspace in activation order', () => {
    const rows = recentRows(TABS)
    expect(rows.map((row) => row.id)).toEqual(['t1', 't2'])
    expect(rows.every((row) => row.group === 'RECENT')).toBe(true)
  })

  it('says nothing about an empty workspace', () => {
    expect(recentRows([])).toEqual([])
  })
})
