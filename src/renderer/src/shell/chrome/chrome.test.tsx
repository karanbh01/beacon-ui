import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LAYOUT_OPTIONS, useChrome } from '../../state/chrome'
import { useWorkspace } from '../../state/tabs.store'
import { sourceRows } from './dataSources'
import { LayoutMenu } from './LayoutMenu'
import { fittingAlign, leftEdge } from './popoverAlign'
import { MenuBar } from '../MenuBar'
import { groupRows, nextIndex, searchRows } from './searchResults'
import type { Tab } from '../../state/tabs.types'

const TABS: Tab[] = [
  {
    id: 't1',
    page: 'data-explorer',
    viewKind: 'prices',
    archetype: 'query',
    title: 'Prices',
    subject: 'AAPL',
    dirty: false
  },
  {
    id: 't2',
    page: 'strategy-builder',
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
    useChrome.setState({ layout: 'single' })
    useWorkspace.setState({ tabs: TABS, activeByPage: {}, closed: [] })
  })

  it('opens the data sources panel and closes it on Escape', async () => {
    const user = userEvent.setup()
    render(<MenuBar engine="connected" />)

    await user.click(screen.getByRole('button', { name: 'Data sources' }))
    expect(screen.getByRole('dialog', { name: 'Data sources' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Data sources' })).toBeNull()
  })

  it('keeps only one panel open at a time', async () => {
    const user = userEvent.setup()
    render(<MenuBar engine="connected" />)

    await user.click(screen.getByRole('button', { name: 'Data sources' }))
    await user.click(screen.getByRole('button', { name: 'Layout' }))

    expect(screen.getByRole('dialog', { name: 'Layout' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Data sources' })).toBeNull()
  })

  it('closes a panel by clicking its own trigger again', async () => {
    const user = userEvent.setup()
    render(<MenuBar engine="connected" />)
    const trigger = screen.getByRole('button', { name: 'Layout' })

    await user.click(trigger)
    await user.click(trigger)

    expect(screen.queryByRole('dialog', { name: 'Layout' })).toBeNull()
  })

  it('persists the layout choice through the store', async () => {
    const user = userEvent.setup()
    render(<MenuBar engine="connected" />)

    await user.click(screen.getByRole('button', { name: 'Layout' }))
    await user.click(screen.getByRole('radio', { name: 'Two columns' }))

    expect(useChrome.getState().layout).toBe('columns')
  })
})

describe('chrome search', () => {
  beforeEach(() => {
    useWorkspace.setState({ tabs: TABS, activeByPage: {}, closed: [] })
  })

  it('opens on the first character, not on submit', async () => {
    const user = userEvent.setup()
    render(<MenuBar engine="connected" />)

    expect(screen.queryByRole('listbox')).toBeNull()
    await user.type(screen.getByRole('combobox', { name: 'Search' }), 'p')

    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('closes on Escape and reopens when typing continues', async () => {
    const user = userEvent.setup()
    render(<MenuBar engine="connected" />)
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
    render(<MenuBar engine="connected" onSelectTab={onSelectTab} />)

    await user.type(screen.getByRole('combobox', { name: 'Search' }), 'prices')
    await user.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Enter}')
    expect(onSelectTab).toHaveBeenCalledWith('t1')
  })

  it('treats Enter with nothing highlighted as a plain submit', async () => {
    const onSearch = vi.fn()
    const user = userEvent.setup()
    render(<MenuBar engine="connected" onSearch={onSearch} />)

    await user.type(screen.getByRole('combobox', { name: 'Search' }), 'anything{Enter}')

    expect(onSearch).toHaveBeenCalledWith('anything')
  })

  it('clears the query once a row is taken', async () => {
    const user = userEvent.setup()
    render(<MenuBar engine="connected" onSelectTab={vi.fn()} />)
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
