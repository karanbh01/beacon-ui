import { useState, type ReactElement } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WithQueries } from '../../../../test/queries'
import { useChrome } from '../../state/chrome'
import { useCurrentPane } from '../../state/currentPane'
import { useFind } from '../../state/find'
import { useWorkspace } from '../../state/tabs.store'
import { fitOf, labelOf, seekTargets } from '../chrome/seekTargets'
import { MenuBar } from '../MenuBar'
import { useNavigationKeys } from '../navigationKeys'
import { PaneHost } from '../PaneHost'
import { clearViews, registerView } from '../viewRegistry'
import { findRanges } from './findMatches'
import { FindBar } from './FindBar'

/**
 * Finding things from the keyboard: Ctrl+F across the open windows (BU-283),
 * Ctrl+K to the search bar (BU-284), and Alt in it for seek mode (BU-285).
 */
const PAGE = 'data-explorer'
const run = vi.fn()

function Setup(): ReactElement {
  return (
    <div>
      <p>Backtest setup for TECH10. TECH10 tracks its index.</p>
      <label>
        Start
        <input />
      </label>
      <button type="button" onClick={run}>
        Run backtest
      </button>
      <button type="button">Validate</button>
      <button type="button" disabled>
        Run later
      </button>
    </div>
  )
}

function App(): ReactElement {
  const [page, setPage] = useState(PAGE)
  useNavigationKeys(page, setPage)
  return (
    <WithQueries>
      <MenuBar engine="connected" page={page} />
      <PaneHost page={PAGE} />
      <FindBar />
    </WithQueries>
  )
}

beforeEach(() => {
  localStorage.clear()
  run.mockClear()
  useWorkspace.getState().reset()
  useChrome.setState({ layoutByPage: { [PAGE]: 'single' }, splits: {} })
  useCurrentPane.setState({ byPage: {}, pulse: undefined, newTab: undefined })
  useFind.setState({ open: false, query: '' })
  clearViews()
  registerView('setup', Setup, { page: PAGE, title: 'Setup', archetype: 'query' })
  useWorkspace.getState().openTab({
    id: 'setup',
    page: PAGE,
    pane: 0,
    viewKind: 'setup',
    archetype: 'query',
    title: 'Setup'
  })
})

afterEach(() => {
  clearViews()
})

describe('Ctrl+F (BU-283)', () => {
  it('finds every match in the open windows, ignoring case', () => {
    render(<App />)

    expect(findRanges('tech10')).toHaveLength(2)
    expect(findRanges('nowhere')).toHaveLength(0)
    expect(findRanges('  ')).toHaveLength(0)
  })

  it('opens a find bar that counts the matches and steps through them', async () => {
    render(<App />)

    await userEvent.keyboard('{Control>}f{/Control}')
    const field = screen.getByRole('textbox', { name: 'Find in windows' })
    expect(field).toHaveFocus()

    await userEvent.type(field, 'tech10')
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByText('2 of 2')).toBeInTheDocument()
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
    expect(screen.getByText('1 of 2')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('search', { name: 'Find in windows' })).toBeNull()
  })

  it('says so when nothing matches', async () => {
    render(<App />)
    await userEvent.keyboard('{Control>}f{/Control}')
    await userEvent.type(screen.getByRole('textbox', { name: 'Find in windows' }), 'zzz')

    expect(screen.getByText('No matches')).toBeInTheDocument()
  })
})

describe('Ctrl+K (BU-284)', () => {
  it('lets Escape leave the search bar again', async () => {
    render(<App />)
    await userEvent.keyboard('{Control>}k{/Control}')
    await userEvent.keyboard('TECH{Escape}')

    expect(screen.getByRole('combobox', { name: 'Search' })).not.toHaveFocus()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('goes to the search bar from anywhere', async () => {
    render(<App />)
    screen.getByRole('button', { name: 'Run backtest' }).focus()

    await userEvent.keyboard('{Control>}k{/Control}')
    expect(screen.getByRole('combobox', { name: 'Search' })).toHaveFocus()
  })
})

describe('seek mode (BU-285)', () => {
  const search = (): HTMLElement => screen.getByRole('combobox', { name: 'Search' })

  it('ranks a whole name, then its start, then a word’s start, then anywhere', () => {
    expect(fitOf('run backtest', 'run backtest')).toBe(0)
    expect(fitOf('run backtest', 'run')).toBe(1)
    expect(fitOf('run backtest', 'back')).toBe(2)
    expect(fitOf('run backtest', 'test')).toBe(3)
    expect(fitOf('run backtest', 'xyz')).toBeUndefined()
  })

  it('names a field by its label, and leaves out what cannot be pressed', () => {
    render(<App />)
    const window = document.querySelector('.pane-body')
    if (window === null) throw new Error('no window')

    expect(labelOf(screen.getByRole('textbox', { name: 'Start' }))).toBe('Start')
    expect(seekTargets(window, 'run').map((target) => target.label)).toEqual(['Run backtest'])
  })

  it('turns yellow on Alt, puts the dropdown away, and marks what the name finds', async () => {
    render(<App />)
    await userEvent.click(search())

    await userEvent.keyboard('{Alt}')
    expect(document.querySelector('.menu-bar-search-surface-seeking')).not.toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()

    await userEvent.keyboard('val')
    expect(screen.getByRole('button', { name: 'Validate' })).toHaveAttribute('data-seek', 'current')
    expect(screen.getByText('1 found')).toBeInTheDocument()
  })

  it('presses the chosen control on Enter, and leaves seek mode', async () => {
    render(<App />)
    await userEvent.click(search())
    await userEvent.keyboard('{Alt}run{Enter}')

    expect(run).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-seek]')).toBeNull()
    expect(document.querySelector('.menu-bar-search-surface-seeking')).toBeNull()
    // Still in the search bar, so Alt seeks again at once (Karan).
    expect(search()).toHaveFocus()
    await userEvent.keyboard('{Alt}val')
    expect(screen.getByRole('button', { name: 'Validate' })).toHaveAttribute('data-seek', 'current')
  })

  it('puts the caret in a field rather than pressing it', async () => {
    render(<App />)
    await userEvent.click(search())
    await userEvent.keyboard('{Alt}start{Enter}')

    expect(screen.getByRole('textbox', { name: 'Start' })).toHaveFocus()
  })

  it('goes back to searching on Escape or Alt, taking its marks with it', async () => {
    render(<App />)
    await userEvent.click(search())
    await userEvent.keyboard('{Alt}run')
    expect(document.querySelector('[data-seek]')).not.toBeNull()

    await userEvent.keyboard('{Alt}')
    expect(document.querySelector('[data-seek]')).toBeNull()
    expect(document.querySelector('.menu-bar-search-surface-seeking')).toBeNull()

    await userEvent.keyboard('{Alt}run{Escape}')
    expect(document.querySelector('[data-seek]')).toBeNull()
    act(() => {
      search().blur()
    })
  })
})
