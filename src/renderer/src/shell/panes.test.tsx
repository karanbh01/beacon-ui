import type { ReactElement } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TAB_MIME } from '../components/Tab/dragTab'
import { useChrome } from '../state/chrome'
import { useWorkspace } from '../state/tabs.store'
import { PaneHost } from './PaneHost'
import { clearViews, registerView, type ViewProps } from './viewRegistry'

function PricesView({ subject }: ViewProps): ReactElement {
  return <p>prices view — {subject ?? 'none'}</p>
}

function ChartingView({ subject }: ViewProps): ReactElement {
  return <p>charting view — {subject ?? 'none'}</p>
}

beforeEach(() => {
  localStorage.clear()
  useWorkspace.getState().reset()
  useChrome.setState({ layout: 'columns' })
  clearViews()
  registerView('prices', PricesView, { page: 'data-explorer', title: 'Prices', archetype: 'query' })
  registerView('charting', ChartingView, {
    page: 'data-explorer',
    title: 'Charting',
    archetype: 'linked'
  })
})

// No layout reset here: this hook runs BEFORE RTL's cleanup, so setting the
// layout would re-render a component that is still mounted, outside act.
afterEach(() => {
  clearViews()
})

function open(id: string, pane: number, over: Record<string, unknown> = {}): void {
  useWorkspace.getState().openTab({
    id,
    page: 'data-explorer',
    pane,
    viewKind: id,
    archetype: 'query',
    title: id === 'prices' ? 'Prices' : 'Charting',
    ...over
  })
}

function pane(index: number): HTMLElement {
  const node = document.querySelector(`[data-pane="${String(index)}"]`)
  if (node === null) throw new Error(`no pane ${String(index)}`)
  return node as HTMLElement
}

/**
 * jsdom has no drag implementation, so the transfer is supplied. That is
 * honest here: what these tests are about is the strip's decision — which
 * pane claims the tab and where it lands — not whether Chromium fires
 * `dragover`. The E2E suite drives a real pointer.
 */
function transfer(id: string): DataTransfer {
  const data: Record<string, string> = { [TAB_MIME]: id }
  return {
    types: [TAB_MIME],
    getData: (type: string) => data[type] ?? '',
    setData: (type: string, value: string) => {
      data[type] = value
    },
    dropEffect: 'move',
    effectAllowed: 'move'
  } as unknown as DataTransfer
}

describe('a pane per layout slot', () => {
  it('renders one tab strip per pane', () => {
    render(<PaneHost page="data-explorer" />)
    expect(screen.getAllByRole('tablist')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'New tab' })).toHaveLength(2)
  })

  it('shows each pane only its own tabs', () => {
    open('prices', 0)
    open('charting', 1)
    render(<PaneHost page="data-explorer" />)

    expect(within(pane(0)).getByRole('button', { name: /^Prices/ })).toBeInTheDocument()
    expect(within(pane(0)).queryByRole('button', { name: /^Charting/ })).toBeNull()
    expect(within(pane(1)).getByRole('button', { name: /^Charting/ })).toBeInTheDocument()
  })

  it('holds an active view in each pane at once, which is the point of a split', () => {
    open('prices', 0, { subject: 'AAPL' })
    open('charting', 1, { subject: 'MSFT' })
    render(<PaneHost page="data-explorer" />)

    expect(within(pane(0)).getByText(/prices view — AAPL/)).toBeInTheDocument()
    expect(within(pane(1)).getByText(/charting view — MSFT/)).toBeInTheDocument()
  })

  it('leaves a pane empty rather than collapsing the layout', async () => {
    open('prices', 0)
    open('charting', 1)
    render(<PaneHost page="data-explorer" />)

    await userEvent.click(within(pane(1)).getByRole('button', { name: 'Close Charting' }))

    expect(screen.getAllByRole('tablist')).toHaveLength(2)
    expect(within(pane(1)).getByText(/Nothing open here yet/)).toBeInTheDocument()
  })

  it('opens into the pane whose + was clicked', async () => {
    render(<PaneHost page="data-explorer" />)

    const plus = screen.getAllByRole('button', { name: 'New tab' })[1]!
    await userEvent.click(plus)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Prices' }))

    expect(useWorkspace.getState().tabs[0]?.pane).toBe(1)
  })

  it('folds every tab into one strip when the layout collapses, and back', () => {
    open('prices', 0)
    open('charting', 1)
    render(<PaneHost page="data-explorer" />)

    act(() => {
      useChrome.setState({ layout: 'single' })
    })
    expect(screen.getAllByRole('tablist')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /^Charting/ })).toBeInTheDocument()

    act(() => {
      useChrome.setState({ layout: 'columns' })
    })
    expect(within(pane(1)).getByRole('button', { name: /^Charting/ })).toBeInTheDocument()
  })
})

describe('dragging a tab between panes', () => {
  it('moves the tab to the pane that received it', () => {
    open('prices', 0)
    open('charting', 0)
    render(<PaneHost page="data-explorer" />)

    const target = pane(1)
    const drag = transfer('charting')
    fireEvent.dragOver(target, { dataTransfer: drag })
    fireEvent.drop(target, { dataTransfer: drag })

    expect(useWorkspace.getState().tabs.find((t) => t.id === 'charting')?.pane).toBe(1)
    expect(within(pane(1)).getByRole('button', { name: /^Charting/ })).toBeInTheDocument()
    expect(within(pane(0)).queryByRole('button', { name: /^Charting/ })).toBeNull()
  })

  it('keeps a link alive across the move', () => {
    open('prices', 0, { subject: 'AAPL' })
    open('charting', 0, { archetype: 'linked', linkSourceId: 'prices' })
    render(<PaneHost page="data-explorer" />)

    const target = within(pane(1)).getByRole('tablist')
    const drag = transfer('charting')
    fireEvent.dragOver(target, { dataTransfer: drag })
    fireEvent.drop(target, { dataTransfer: drag })

    // Still following, and still resolving — a link is by id, not proximity.
    expect(within(pane(1)).getByText(/charting view — AAPL/)).toBeInTheDocument()
  })

  it('takes a drop on the pane body, not just the strip (BU-70)', () => {
    open('prices', 0)
    open('charting', 0)
    render(<PaneHost page="data-explorer" />)

    // The empty state, which is as far from the tab strip as the pane goes.
    const body = within(pane(1)).getByText(/Nothing open here yet/)
    const drag = transfer('charting')
    fireEvent.dragOver(body, { dataTransfer: drag })
    fireEvent.drop(body, { dataTransfer: drag })

    expect(useWorkspace.getState().tabs.find((t) => t.id === 'charting')?.pane).toBe(1)
  })

  it('marks the pane it would land in', () => {
    open('prices', 0)
    render(<PaneHost page="data-explorer" />)

    expect(pane(1)).toHaveAttribute('data-dropping', 'false')
    fireEvent.dragOver(pane(1), { dataTransfer: transfer('prices') })
    expect(pane(1)).toHaveAttribute('data-dropping', 'true')
    expect(pane(0)).toHaveAttribute('data-dropping', 'false')
  })

  it('does not clear the mark when the cursor crosses onto a child', () => {
    // Chromium fires dragenter on the child BEFORE dragleave on the parent,
    // so the depth never reaches zero and the mark holds. Reacting to the
    // bare dragleave is how a drop affordance ends up flickering.
    open('prices', 0)
    render(<PaneHost page="data-explorer" />)

    const drag = transfer('prices')
    fireEvent.dragEnter(pane(1), { dataTransfer: drag })
    fireEvent.dragOver(pane(1), { dataTransfer: drag })
    expect(pane(1)).toHaveAttribute('data-dropping', 'true')

    const child = within(pane(1)).getByText(/Nothing open here yet/)
    fireEvent.dragEnter(child, { dataTransfer: drag })
    fireEvent.dragLeave(pane(1), { dataTransfer: drag })

    expect(pane(1)).toHaveAttribute('data-dropping', 'true')
  })

  it('clears the mark once the drag has left the pane for good', () => {
    open('prices', 0)
    render(<PaneHost page="data-explorer" />)

    const drag = transfer('prices')
    fireEvent.dragEnter(pane(1), { dataTransfer: drag })
    fireEvent.dragOver(pane(1), { dataTransfer: drag })
    fireEvent.dragLeave(pane(1), { dataTransfer: drag })

    expect(pane(1)).toHaveAttribute('data-dropping', 'false')
  })

  it('leaves a tab alone when it is dropped on the body of its own pane', () => {
    // Nothing is being expressed by that drop, so moving it to the end would
    // be the app inventing an instruction.
    open('prices', 0)
    open('charting', 0)
    render(<PaneHost page="data-explorer" />)

    const body = within(pane(0)).getByText(/charting view/)
    const drag = transfer('charting')
    fireEvent.dragOver(body, { dataTransfer: drag })
    fireEvent.drop(body, { dataTransfer: drag })

    expect(useWorkspace.getState().tabs.map((t) => t.id)).toEqual(['prices', 'charting'])
    expect(useWorkspace.getState().tabs.find((t) => t.id === 'charting')?.pane).toBe(0)
  })

  it('ignores a drag that is not carrying one of our tabs', () => {
    open('prices', 0)
    render(<PaneHost page="data-explorer" />)

    const target = pane(1)
    const files = { types: ['Files'], getData: () => '' } as unknown as DataTransfer
    fireEvent.dragOver(target, { dataTransfer: files })
    fireEvent.drop(target, { dataTransfer: files })

    expect(target).toHaveAttribute('data-dropping', 'false')
    expect(useWorkspace.getState().tabs[0]?.pane).toBe(0)
  })
})
