import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WithQueries } from '../../../../test/queries'
import { useChrome } from '../../state/chrome'
import { useModellingDefaults } from '../../state/modellingDefaults'
import { usePresets, type Preset } from '../../state/presets'
import { useWorkspace } from '../../state/tabs.store'
import { MenuBar } from '../MenuBar'

/**
 * The menus made to work in 0.2.5: Edit's five commands (BU-273), View's two
 * shortcuts (BU-274, BU-275), and the app's own modelling assumptions
 * (BU-272).
 */
const PRICES = { pane: 0, viewKind: 'prices', archetype: 'query', title: 'Prices' } as const

const PRESETS: Preset[] = [
  {
    id: 'p1',
    name: 'Two prices',
    code: 'DE001',
    page: 'data-explorer',
    layout: 'columns',
    tabs: [PRICES]
  },
  {
    id: 'p2',
    name: 'Four prices',
    code: 'DE002',
    page: 'data-explorer',
    layout: 'grid',
    tabs: [PRICES]
  },
  { id: 'p3', name: 'Overview', code: 'BV001', page: 'beacon-view', layout: 'single', tabs: [] }
]

function bar(): void {
  render(
    <WithQueries>
      <MenuBar engine="connected" page="data-explorer" />
      <input aria-label="A field" defaultValue="TECH10" />
    </WithQueries>
  )
}

beforeEach(() => {
  localStorage.clear()
  useChrome.setState({ layoutByPage: {}, splits: {} })
  useModellingDefaults.setState({ assumptions: {} })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the Edit menu (BU-273)', () => {
  it('pastes into the field that had focus before the menu opened', async () => {
    const edit = vi.fn(() => Promise.resolve())
    const seen: (Element | null)[] = []
    edit.mockImplementation(() => {
      seen.push(document.activeElement)
      return Promise.resolve()
    })
    vi.stubGlobal('beacon', { ...window.beacon, edit })
    bar()

    const field = screen.getByLabelText('A field')
    await userEvent.click(field)
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Paste/ }))

    expect(edit).toHaveBeenCalledWith('paste')
    // Back on the field when the command ran, not on the menu.
    expect(seen).toEqual([field])
  })

  it('offers all five, each with its shortcut', async () => {
    bar()
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    for (const [label, hint] of [
      ['Undo', 'Ctrl+Z'],
      ['Redo', 'Ctrl+Y'],
      ['Cut', 'Ctrl+X'],
      ['Copy', 'Ctrl+C'],
      ['Paste', 'Ctrl+V']
    ] as const) {
      const item = screen.getByRole('menuitem', { name: new RegExp(label) })
      expect(item).toBeEnabled()
      expect(item).toHaveTextContent(hint)
    }
  })
})

describe("View's shortcuts (BU-274, BU-275)", () => {
  it('resets the window on Ctrl+Shift+R, and stops it reaching the reload', () => {
    useChrome.setState({ layoutByPage: { 'data-explorer': 'grid' } })
    useWorkspace.setState({ tabs: [] })
    bar()

    const event = new KeyboardEvent('keydown', {
      key: 'R',
      code: 'KeyR',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true
    })
    document.dispatchEvent(event)

    expect(useChrome.getState().layoutByPage['data-explorer']).toBe('single')
    expect(event.defaultPrevented).toBe(true)
  })

  it('opens the page’s presets on Ctrl+Shift+P, and applies the one chosen', async () => {
    usePresets.setState({ presets: PRESETS })
    bar()
    await userEvent.keyboard('{Control>}{Shift>}P{/Shift}{/Control}')

    const picker = screen.getByRole('dialog', { name: 'Presets' })
    // This page's only: a Beacon View preset names views Data Explorer lacks.
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(picker).toHaveTextContent('DE002')
    expect(picker).not.toHaveTextContent('BV001')

    await userEvent.click(screen.getByRole('option', { name: /Two prices/ }))
    expect(useChrome.getState().layoutByPage['data-explorer']).toBe('columns')
    expect(screen.queryByRole('dialog', { name: 'Presets' })).toBeNull()
  })

  it('walks the presets with the arrow keys and takes one with Enter', async () => {
    usePresets.setState({ presets: PRESETS })
    bar()
    await userEvent.click(screen.getByRole('button', { name: 'View' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Presets/ }))

    // Opens on the first; one down is the second.
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(useChrome.getState().layoutByPage['data-explorer']).toBe('grid')
  })

  it('says so when the page has none yet', async () => {
    usePresets.setState({ presets: [] })
    bar()
    await userEvent.keyboard('{Control>}{Shift>}P{/Shift}{/Control}')

    expect(screen.getByText(/None for this page yet/)).toBeInTheDocument()
  })

  it('says Home has none, rather than listing presets it cannot use', async () => {
    usePresets.setState({ presets: PRESETS })
    render(
      <WithQueries>
        <MenuBar engine="connected" page="home" />
      </WithQueries>
    )
    await userEvent.keyboard('{Control>}{Shift>}P{/Shift}{/Control}')

    expect(screen.getByText(/Home has no panes/)).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})

describe('the modelling assumptions for the whole app (BU-272)', () => {
  it('opens from Analysis', async () => {
    bar()
    await userEvent.click(screen.getByRole('button', { name: 'Analysis' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Modelling assumptions/ }))

    expect(screen.getByRole('dialog', { name: 'Modelling assumptions' })).toBeInTheDocument()
    expect(screen.getByText(/Every new backtest starts with these/)).toBeInTheDocument()
  })

  it('keeps only what was set, and goes back to the engine’s defaults', () => {
    const { setAssumption, reset } = useModellingDefaults.getState()
    setAssumption('cash_rate', '0.03')
    setAssumption('fx_policy', '')
    expect(useModellingDefaults.getState().assumptions).toEqual({ cash_rate: '0.03' })

    setAssumption('cash_rate', '')
    expect(useModellingDefaults.getState().assumptions).toEqual({})

    setAssumption('cash_rate', '0.03')
    reset()
    expect(useModellingDefaults.getState().assumptions).toEqual({})
  })
})
