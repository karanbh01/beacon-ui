import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { PaneHost } from './PaneHost'
import { newTabOptions, tabForOption } from './newTabOptions'
import { useWorkspace } from '../state/tabs.store'
import { registerPlaceholderViews } from '../views/register'
import { clearViews, viewsForPage } from './viewRegistry'
import type { Tab } from '../state/tabs.types'

/**
 * Choosing a view renders it, and a live view reaches for the query client.
 * The client is never used here — nothing is allowed to retry — but its
 * absence throws before the assertion about the store can run.
 */
function withQueries(ui: React.ReactElement): React.ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>
}

function tab(over: Partial<Tab> & { id: string; archetype: Tab['archetype'] }): Tab {
  return { page: 'p', viewKind: 'v', title: 'T', dirty: false, ...over }
}

const VIEWS = [
  { viewKind: 'prices', page: 'p', title: 'Prices', archetype: 'query' as const },
  { viewKind: 'charting', page: 'p', title: 'Charting', archetype: 'linked' as const },
  { viewKind: 'overview', page: 'p', title: 'Overview', archetype: 'pinned' as const },
  { viewKind: 'watchlist', page: 'p', title: 'Watchlist', archetype: 'global' as const }
]

/**
 * Taxonomy §1 is the whole of this. A linked tab holds no subject and reads
 * one from another tab; a pinned tab hangs off a document. Offering either
 * with nothing to attach to creates a tab that can never resolve a subject.
 */
describe('newTabOptions', () => {
  it('offers query and global on an empty page, and nothing that needs an anchor', () => {
    const options = newTabOptions(VIEWS, [])
    const blocked = options.filter((o) => o.unavailable !== undefined).map((o) => o.viewKind)

    expect(blocked).toEqual(['charting', 'overview'])
  })

  it('unlocks a linked view once a query tab exists to follow', () => {
    const options = newTabOptions(VIEWS, [tab({ id: 'a', archetype: 'query', subject: 'CMPA' })])

    expect(options.find((o) => o.viewKind === 'charting')?.unavailable).toBeUndefined()
    // A document is still missing, so pinned stays shut.
    expect(options.find((o) => o.viewKind === 'overview')?.unavailable).toBeDefined()
  })

  it('unlocks a pinned view once a document exists', () => {
    const options = newTabOptions(VIEWS, [tab({ id: 'd', archetype: 'document' })])
    expect(options.find((o) => o.viewKind === 'overview')?.unavailable).toBeUndefined()
  })

  it('will not follow another follower', () => {
    // A linked tab stores no subject, so linking to one gives a chain with no
    // source at the end of it.
    const options = newTabOptions(VIEWS, [tab({ id: 'l', archetype: 'linked', linkSourceId: 'x' })])
    expect(options.find((o) => o.viewKind === 'charting')?.unavailable).toBeDefined()
  })
})

describe('tabForOption', () => {
  it('opens a query view with no subject, waiting for a ticker', () => {
    const made = tabForOption(VIEWS[0]!, 'p', [])
    expect(made).toMatchObject({ viewKind: 'prices', archetype: 'query' })
    expect('subject' in made).toBe(false)
  })

  it('attaches a linked view to the query tab it will follow', () => {
    const source = tab({ id: 'src', archetype: 'query', subject: 'CMPA' })
    expect(tabForOption(VIEWS[1]!, 'p', [source])).toMatchObject({ linkSourceId: 'src' })
  })

  it('pins to the open document', () => {
    const doc = tab({ id: 'doc', archetype: 'document', title: 'TECH10' })
    expect(tabForOption(VIEWS[2]!, 'p', [doc])).toMatchObject({ pinnedDoc: 'TECH10' })
  })

  it('gives each tab of the same kind its own id', () => {
    const first = tabForOption(VIEWS[0]!, 'p', [])
    const second = tabForOption(VIEWS[0]!, 'p', [tab({ id: first.id, archetype: 'query' })])
    expect(second.id).not.toBe(first.id)
  })
})

describe('PaneHost with nothing open (BU-59)', () => {
  beforeEach(() => {
    clearViews()
    registerPlaceholderViews()
    useWorkspace.setState({ tabs: [], activeByPage: {}, closed: [] })
  })

  it('shows no tabs and names the page', () => {
    render(<PaneHost page="data-explorer" />)

    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.getByText('Data Explorer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New tab' })).toBeInTheDocument()
  })

  it('opens a view chosen from the + menu', async () => {
    const user = userEvent.setup()
    render(withQueries(<PaneHost page="data-explorer" />))

    await user.click(screen.getByRole('button', { name: 'New tab' }))
    await user.click(screen.getByRole('menuitem', { name: 'Prices' }))

    const opened = useWorkspace.getState().tabs
    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatchObject({ viewKind: 'prices', page: 'data-explorer' })
    // The point of removing the seeds: no instrument nobody asked for.
    expect(opened[0]?.subject).toBeUndefined()
  })

  it('will not offer a view that has nothing to attach to', async () => {
    const user = userEvent.setup()
    render(<PaneHost page="data-explorer" />)

    await user.click(screen.getByRole('button', { name: 'New tab' }))

    // Charting is linked; with no query tab open it is present but inert.
    expect(screen.getByRole('menuitem', { name: /Charting/ })).toBeDisabled()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<PaneHost page="data-explorer" />)

    await user.click(screen.getByRole('button', { name: 'New tab' }))
    expect(screen.getByRole('dialog', { name: 'New tab' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'New tab' })).toBeNull()
  })

  it('offers every registered view for the page', async () => {
    const user = userEvent.setup()
    render(<PaneHost page="derivatives" />)

    await user.click(screen.getByRole('button', { name: 'New tab' }))

    expect(screen.getAllByRole('menuitem')).toHaveLength(viewsForPage('derivatives').length)
  })
})

describe('the workspace no longer seeds', () => {
  it('starts with nothing', () => {
    useWorkspace.getState().reset()
    expect(useWorkspace.getState().tabs).toEqual([])
  })

  it('drops tabs a previous version seeded', async () => {
    const { dropSeededTabs } = await import('../state/tabs.store')
    const state = {
      tabs: [
        tab({ id: 'seed-prices', archetype: 'query' }),
        tab({ id: 'tab-prices', archetype: 'query' })
      ],
      activeByPage: { 'data-explorer': 'seed-prices' },
      closed: []
    }

    const migrated = dropSeededTabs(state)

    expect(migrated.tabs.map((t) => t.id)).toEqual(['tab-prices'])
    // And the page must not point at a tab that no longer exists.
    expect(migrated.activeByPage['data-explorer']).toBeUndefined()
  })
})
