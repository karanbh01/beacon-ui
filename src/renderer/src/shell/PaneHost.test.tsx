import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PaneHost } from './PaneHost'
import { chipFor } from './chips'
import { clearViews, registerView, type ViewProps } from './viewRegistry'
import { useWorkspace } from '../state/tabs.store'
import type { Tab } from '../state/tabs.types'

function PricesView({ subject }: ViewProps): ReactElement {
  return <p>prices view — {subject ?? 'none'}</p>
}

function ChartingView({ subject }: ViewProps): ReactElement {
  return <p>charting view — {subject ?? 'none'}</p>
}

beforeEach(() => {
  localStorage.clear()
  useWorkspace.getState().reset()
  clearViews()
  registerView('prices', PricesView)
  registerView('charting', ChartingView)
})

afterEach(() => {
  clearViews()
})

function seed(): void {
  const store = useWorkspace.getState()
  store.openTab({
    id: 'prices',
    page: 'data-explorer',
    viewKind: 'prices',
    archetype: 'query',
    title: 'Prices',
    subject: 'AAPL'
  })
  store.openTab({
    id: 'charting',
    page: 'data-explorer',
    viewKind: 'charting',
    archetype: 'linked',
    title: 'Charting',
    linkSourceId: 'prices'
  })
  store.openTab({
    id: 'tech10',
    page: 'strategy-builder',
    viewKind: 'index-definition',
    archetype: 'document',
    title: 'TECH10'
  })
  store.selectTab('prices')
}

describe('rendering the active view', () => {
  it('renders the registered component for the active tab', () => {
    seed()
    render(<PaneHost page="data-explorer" />)

    expect(screen.getByText(/prices view/)).toBeInTheDocument()
  })

  it('passes the live subject, resolved through links', () => {
    seed()
    useWorkspace.getState().selectTab('charting')
    render(<PaneHost page="data-explorer" />)

    // Charting follows Prices, so it renders AAPL without storing it.
    expect(screen.getByText(/charting view — AAPL/)).toBeInTheDocument()
  })

  it('names the missing kind rather than rendering blank', () => {
    seed()
    render(<PaneHost page="strategy-builder" />)

    expect(screen.getByText(/No view registered for/)).toHaveTextContent('index-definition')
  })

  it('says so when a page has no tabs', () => {
    render(<PaneHost page="reports" />)
    expect(screen.getByText('No tabs open on this page.')).toBeInTheDocument()
  })
})

describe('per-page tab sets (BU-17 acceptance)', () => {
  it('shows only the tabs belonging to the page', () => {
    seed()
    render(<PaneHost page="data-explorer" />)

    // Anchored: each tab renders a select button ("Prices AAPL") AND a close
    // button ("Close Prices"), so an unanchored /Prices/ matches both.
    expect(screen.getByRole('button', { name: /^Prices/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^TECH10/ })).toBeNull()
  })

  it('restores each page to its own active tab', () => {
    seed()
    useWorkspace.getState().selectTab('charting')

    const first = render(<PaneHost page="data-explorer" />)
    expect(screen.getByText(/charting view/)).toBeInTheDocument()
    first.unmount()

    // Switch away and back: the page remembers charting, not prices.
    const second = render(<PaneHost page="strategy-builder" />)
    expect(screen.queryByText(/charting view/)).toBeNull()
    second.unmount()

    render(<PaneHost page="data-explorer" />)
    expect(screen.getByText(/charting view/)).toBeInTheDocument()
  })

  it('switches the active view on tab click', async () => {
    seed()
    render(<PaneHost page="data-explorer" />)

    await userEvent.click(screen.getByRole('button', { name: /^Charting/ }))

    expect(screen.getByText(/charting view/)).toBeInTheDocument()
  })

  it('closes a tab and falls back to a neighbour', async () => {
    seed()
    render(<PaneHost page="data-explorer" />)

    await userEvent.click(screen.getByRole('button', { name: 'Close Prices' }))

    expect(screen.queryByRole('button', { name: /^Prices/ })).toBeNull()
    expect(screen.getByText(/charting view/)).toBeInTheDocument()
  })
})

describe('chipFor', () => {
  const base: Tab = {
    id: 't',
    page: 'p',
    viewKind: 'v',
    archetype: 'query',
    title: 'T',
    dirty: false
  }

  it('gives a query tab a chainless subject chip', () => {
    expect(chipFor(base, 'AAPL')).toEqual({ kind: 'query', subject: 'AAPL' })
  })

  it('gives a linked tab a subject chip WITH the chain', () => {
    expect(chipFor({ ...base, archetype: 'linked' }, 'AAPL')).toEqual({
      kind: 'query',
      subject: 'AAPL',
      linked: true
    })
  })

  it('gives a pinned tab a link chip naming its document', () => {
    expect(chipFor({ ...base, archetype: 'pinned', pinnedDoc: 'TECH10' }, 'TECH10')).toEqual({
      kind: 'pin',
      target: 'TECH10'
    })
  })

  it('gives documents and global tools no chip at all', () => {
    expect(chipFor({ ...base, archetype: 'document' }, undefined)).toBeUndefined()
    expect(chipFor({ ...base, archetype: 'global' }, undefined)).toBeUndefined()
  })
})
