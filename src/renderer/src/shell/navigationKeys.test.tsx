import { useState, type ReactElement } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useChrome } from '../state/chrome'
import { useCurrentPane } from '../state/currentPane'
import { useShortcuts } from '../state/shortcuts'
import { activeTab, tabsForPane } from '../state/tabs.logic'
import { useWorkspace } from '../state/tabs.store'
import { useNavigationKeys } from './navigationKeys'
import { paneInDirection, panesFor } from './paneGrid'
import { PaneHost } from './PaneHost'
import { clearViews, registerView } from './viewRegistry'

/**
 * Moving around from the keyboard (BU-276, BU-277, BU-278): Ctrl+Up/Down for
 * the sidebar's sections, Ctrl+Left/Right for the tabs in the current
 * window, and Ctrl+Shift+arrows for the window that way.
 */
const PAGE = 'data-explorer'

function Workspace({ start = PAGE }: { start?: string }): ReactElement {
  const [page, setPage] = useState(start)
  useNavigationKeys(page, setPage)
  return (
    <>
      <p data-testid="page">{page}</p>
      <input aria-label="A field" />
      <PaneHost page={PAGE} />
    </>
  )
}

function press(
  key: string,
  modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; code?: string }
): void {
  fireEvent.keyDown(document.activeElement ?? document.body, { key, ...modifiers })
}

function open(id: string, pane: number): void {
  useWorkspace.getState().openTab({
    id,
    page: PAGE,
    pane,
    viewKind: 'prices',
    archetype: 'query',
    title: id
  })
}

function pane(index: number): Element {
  const node = document.querySelector(`[data-pane="${String(index)}"]`)
  if (node === null) throw new Error(`no pane ${String(index)}`)
  return node
}

function selected(pane: number): string | undefined {
  return activeTab(useWorkspace.getState(), PAGE, pane, 2)?.id
}

beforeEach(() => {
  localStorage.clear()
  useShortcuts.setState({ assigned: {} })
  useWorkspace.getState().reset()
  useChrome.setState({ layoutByPage: { [PAGE]: 'columns' }, splits: {} })
  useCurrentPane.setState({ byPage: {}, pulse: undefined, newTab: undefined })
  clearViews()
  registerView('prices', () => <p>prices</p>, { page: PAGE, title: 'Prices', archetype: 'query' })
})

afterEach(() => {
  clearViews()
})

describe('Ctrl+Up and Ctrl+Down (BU-276)', () => {
  it('step through the sidebar’s sections, Strategy Builder up to Optimiser', () => {
    render(<Workspace start="strategy-builder" />)

    press('ArrowUp', { ctrlKey: true })
    expect(screen.getByTestId('page')).toHaveTextContent('optimiser')

    press('ArrowDown', { ctrlKey: true })
    press('ArrowDown', { ctrlKey: true })
    expect(screen.getByTestId('page')).toHaveTextContent('derivatives')
  })

  it('run from Home to Guides, as the sidebar draws them, and wrap at the ends (Karan)', () => {
    render(<Workspace start="home" />)

    press('ArrowDown', { ctrlKey: true })
    expect(screen.getByTestId('page')).toHaveTextContent('data-explorer')
    press('ArrowUp', { ctrlKey: true })
    expect(screen.getByTestId('page')).toHaveTextContent('home')
    press('ArrowUp', { ctrlKey: true })
    expect(screen.getByTestId('page')).toHaveTextContent('guides')
    press('ArrowUp', { ctrlKey: true })
    expect(screen.getByTestId('page')).toHaveTextContent('reports')
    press('ArrowDown', { ctrlKey: true })
    press('ArrowDown', { ctrlKey: true })
    expect(screen.getByTestId('page')).toHaveTextContent('home')
  })

  it('leave a field’s own Ctrl+arrows alone', () => {
    render(<Workspace />)
    screen.getByLabelText('A field').focus()

    press('ArrowDown', { ctrlKey: true })
    expect(screen.getByTestId('page')).toHaveTextContent('data-explorer')
  })
})

describe('Ctrl+Shift+arrows (BU-277)', () => {
  it('move to the window that way and pulse it, stopping at the edge', () => {
    open('left', 0)
    open('right', 1)
    render(<Workspace />)
    fireEvent.pointerDown(pane(0))

    act(() => {
      press('ArrowRight', { ctrlKey: true, shiftKey: true })
    })
    expect(useCurrentPane.getState().byPage[PAGE]).toBe(1)
    expect(document.querySelector('[data-pane="1"] .pane-pulse')).not.toBeNull()
    expect(document.querySelector('[data-pane="0"] .pane-pulse')).toBeNull()

    // Nothing further right, and a move with a direction does not wrap.
    act(() => {
      press('ArrowRight', { ctrlKey: true, shiftKey: true })
    })
    expect(useCurrentPane.getState().byPage[PAGE]).toBe(1)
  })

  it('go down to a stacked window, where Ctrl+Down alone would change section', () => {
    useChrome.setState({ layoutByPage: { [PAGE]: 'rows' } })
    open('top', 0)
    open('bottom', 1)
    render(<Workspace />)
    fireEvent.pointerDown(pane(0))

    act(() => {
      press('ArrowDown', { ctrlKey: true, shiftKey: true })
    })
    expect(useCurrentPane.getState().byPage[PAGE]).toBe(1)
    expect(screen.getByTestId('page')).toHaveTextContent('data-explorer')
  })

  it('do nothing on a page with one window', () => {
    useChrome.setState({ layoutByPage: { [PAGE]: 'single' } })
    open('only', 0)
    render(<Workspace />)

    press('ArrowRight', { ctrlKey: true, shiftKey: true })
    expect(document.querySelector('.pane-pulse')).toBeNull()
  })
})

describe('the window that way, as the layout draws them', () => {
  it('reaches the nearest stacked window from the main one, and back', () => {
    const panes = panesFor('main-stack')
    expect(paneInDirection(panes, 0, 'right')).toBe(1)
    expect(paneInDirection(panes, 2, 'left')).toBe(0)
    expect(paneInDirection(panes, 1, 'down')).toBe(2)
    expect(paneInDirection(panes, 0, 'up')).toBeUndefined()
  })

  it('crosses a full-width window to whichever half lies beneath', () => {
    const panes = panesFor('banner')
    expect(paneInDirection(panes, 0, 'down')).toBeDefined()
    expect(paneInDirection(panes, 1, 'up')).toBe(0)
  })
})

describe('Ctrl+Left and Ctrl+Right (BU-278)', () => {
  it('select the next tab in the current window only', () => {
    open('a', 0)
    open('b', 0)
    open('c', 1)
    render(<Workspace />)
    // A click makes the left window current.
    fireEvent.pointerDown(pane(0))
    act(() => {
      useWorkspace.getState().selectTab('a', 0)
    })

    act(() => {
      press('ArrowRight', { ctrlKey: true })
    })
    expect(selected(0)).toBe('b')
    expect(selected(1)).toBe('c')

    act(() => {
      press('ArrowRight', { ctrlKey: true })
    })
    expect(selected(0)).toBe('a')
  })

  it('leave word-by-word moves in a field alone', () => {
    open('a', 0)
    open('b', 0)
    render(<Workspace />)
    act(() => {
      useWorkspace.getState().selectTab('a', 0)
    })
    screen.getByLabelText('A field').focus()

    press('ArrowRight', { ctrlKey: true })
    expect(selected(0)).toBe('a')
  })
})

function order(pane: number): string[] {
  return tabsForPane(useWorkspace.getState(), PAGE, pane, 2).map((tab) => tab.id)
}

describe('Ctrl+T, Ctrl+W and Ctrl+Shift+T (BU-280)', () => {
  it('opens the current window’s new-tab menu, focused on its first choice', () => {
    open('a', 0)
    render(<Workspace />)
    fireEvent.pointerDown(pane(0))

    act(() => {
      press('t', { ctrlKey: true, code: 'KeyT' })
    })
    const menu = screen.getByRole('menu')
    expect(pane(0).contains(menu)).toBe(true)
    expect(menu.contains(document.activeElement)).toBe(true)
  })

  it('closes the current window’s tab, and brings it back', () => {
    open('a', 0)
    open('b', 0)
    render(<Workspace />)
    fireEvent.pointerDown(pane(0))
    act(() => {
      useWorkspace.getState().selectTab('b', 0)
    })

    act(() => {
      press('w', { ctrlKey: true, code: 'KeyW' })
    })
    expect(order(0)).toEqual(['a'])

    act(() => {
      press('T', { ctrlKey: true, shiftKey: true, code: 'KeyT' })
    })
    expect(order(0)).toEqual(['a', 'b'])
  })

  it('keeps Ctrl+W from closing the window, even when there is no tab to close', () => {
    useChrome.setState({ layoutByPage: { [PAGE]: 'single' } })
    render(<Workspace />)
    const event = new KeyboardEvent('keydown', {
      key: 'w',
      code: 'KeyW',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    })
    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })
})

describe('Alt+arrows carry the tab (BU-281)', () => {
  it('moves the tab one place along its window, stopping at the end', () => {
    open('a', 0)
    open('b', 0)
    open('c', 0)
    render(<Workspace />)
    fireEvent.pointerDown(pane(0))
    act(() => {
      useWorkspace.getState().selectTab('a', 0)
    })

    act(() => {
      press('ArrowRight', { altKey: true })
    })
    expect(order(0)).toEqual(['b', 'a', 'c'])
    act(() => {
      press('ArrowRight', { altKey: true })
      press('ArrowRight', { altKey: true })
    })
    expect(order(0)).toEqual(['b', 'c', 'a'])

    act(() => {
      press('ArrowLeft', { altKey: true })
    })
    expect(order(0)).toEqual(['b', 'a', 'c'])
  })

  it('with Shift, carries the tab into the window that way, and follows it', () => {
    open('a', 0)
    open('b', 0)
    open('c', 1)
    render(<Workspace />)
    fireEvent.pointerDown(pane(0))
    act(() => {
      useWorkspace.getState().selectTab('a', 0)
    })

    act(() => {
      press('ArrowRight', { altKey: true, shiftKey: true })
    })
    expect(order(0)).toEqual(['b'])
    expect(order(1)).toEqual(['c', 'a'])
    expect(selected(1)).toBe('a')
    expect(useCurrentPane.getState().byPage[PAGE]).toBe(1)
    expect(document.querySelector('[data-pane="1"] .pane-pulse')).not.toBeNull()
  })

  it('leaves a field’s Alt+arrows alone', () => {
    open('a', 0)
    open('b', 0)
    render(<Workspace />)
    act(() => {
      useWorkspace.getState().selectTab('a', 0)
    })
    screen.getByLabelText('A field').focus()

    press('ArrowRight', { altKey: true })
    expect(order(0)).toEqual(['a', 'b'])
  })
})

describe('the keys Settings gives them (BU-291)', () => {
  it('moves an action to its new keys, and off its old ones', () => {
    useShortcuts.getState().assign('section-down', [['Ctrl', 'J']])
    render(<Workspace start="home" />)

    press('ArrowDown', { ctrlKey: true })
    expect(screen.getByTestId('page')).toHaveTextContent('home')
    press('j', { ctrlKey: true })
    expect(screen.getByTestId('page')).toHaveTextContent('data-explorer')
  })

  it('leaves a key a field would type to the field', () => {
    useShortcuts.getState().assign('section-down', [['J']])
    render(<Workspace start="home" />)

    screen.getByLabelText('A field').focus()
    press('j', {})
    expect(screen.getByTestId('page')).toHaveTextContent('home')

    act(() => {
      screen.getByLabelText('A field').blur()
    })
    press('j', {})
    expect(screen.getByTestId('page')).toHaveTextContent('data-explorer')
  })
})
