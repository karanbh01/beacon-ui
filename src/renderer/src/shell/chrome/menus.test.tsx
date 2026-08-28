import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { WithQueries } from '../../../../test/queries'
import { LAYOUT_OPTIONS, useChrome } from '../../state/chrome'
import { MenuBar } from '../MenuBar'
import { buildMenus, nextEnabled, type MenuItem } from './menuModel'

const CONTEXT = { theme: 'system' as const, layout: 'single' }

beforeEach(() => {
  localStorage.clear()
  useChrome.setState({ layoutByPage: {}, splits: {} })
})

describe('buildMenus', () => {
  it('covers every label the bar shows', () => {
    expect(buildMenus(CONTEXT).map((menu) => menu.label)).toEqual([
      'File',
      'Edit',
      'View',
      'Data',
      'Analysis',
      'Asset',
      'Portfolio',
      'Settings',
      'Help'
    ])
  })

  it('leaves no menu empty', () => {
    // An empty dropdown is worse than no dropdown — it reads as broken.
    for (const menu of buildMenus(CONTEXT)) {
      expect(menu.items.length, menu.label).toBeGreaterThan(0)
    }
  })

  it('offers every layout the Layout menu does', () => {
    const view = buildMenus(CONTEXT).find((menu) => menu.label === 'View')
    const layouts = view?.items.filter((item) => item.action.startsWith('layout-'))

    expect(layouts).toHaveLength(LAYOUT_OPTIONS.length)
  })

  it('offers saving an arrangement whether or not any are saved', () => {
    const view = buildMenus(CONTEXT).find((menu) => menu.label === 'View')
    expect(view?.items.some((item) => item.action === 'preset-save')).toBe(true)
  })

  it('lists the presets it is given, and applies by id', () => {
    // The caller has already filtered these to the page being shown: a
    // preset names views by kind, and the kinds a page can open are its own.
    const view = buildMenus({
      ...CONTEXT,
      presets: [{ id: 'preset-2', name: 'Research' }]
    }).find((menu) => menu.label === 'View')

    const preset = view?.items.find((item) => item.label === 'Research')
    expect(preset?.action).toBe('preset-apply-preset-2')
    expect(preset?.enabled).toBe(true)
  })

  it('ticks the theme and layout in force', () => {
    const view = buildMenus({ theme: 'dark', layout: 'grid' }).find((m) => m.label === 'View')
    const ticked = view?.items.filter((item) => item.checked === true).map((item) => item.label)

    expect(ticked).toEqual(['Dark theme', 'Four panes'])
  })

  it('marks everything it cannot do as disabled rather than hiding it', () => {
    // The honest reading of an unfinished menu bar: the items are there and
    // visibly not wired, rather than a File menu with one entry in it.
    const file = buildMenus(CONTEXT).find((menu) => menu.label === 'File')
    expect(file?.items.every((item) => !item.enabled)).toBe(true)
  })
})

describe('nextEnabled', () => {
  const items: MenuItem[] = [
    { label: 'a', action: 'none', enabled: false },
    { label: 'b', action: 'none', enabled: true },
    { label: 'c', action: 'none', enabled: false },
    { label: 'd', action: 'none', enabled: true }
  ]

  it('skips disabled items rather than landing on them', () => {
    expect(nextEnabled(items, -1, 1)).toBe(1)
    expect(nextEnabled(items, 1, 1)).toBe(3)
  })

  it('wraps at both ends', () => {
    expect(nextEnabled(items, 3, 1)).toBe(1)
    expect(nextEnabled(items, 1, -1)).toBe(3)
  })

  it('reports nothing reachable when every item is inert', () => {
    const dead: MenuItem[] = [{ label: 'x', action: 'none', enabled: false }]
    expect(nextEnabled(dead, -1, 1)).toBe(-1)
  })
})

describe('the menu bar', () => {
  const bar = (): void => {
    render(
      <WithQueries>
        <MenuBar engine="connected" page="data-explorer" />
      </WithQueries>
    )
  }

  it('opens a dropdown on click', async () => {
    bar()
    await userEvent.click(screen.getByRole('button', { name: 'File' }))

    expect(screen.getByRole('menu', { name: 'File' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /New index/ })).toBeInTheDocument()
  })

  it('switches menus on hover once one is open, and not before', async () => {
    // Standard menu-bar traversal. Before anything is open, moving across the
    // bar must NOT open menus under the pointer.
    bar()
    await userEvent.hover(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.queryByRole('menu')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'File' }))
    await userEvent.hover(screen.getByRole('button', { name: 'Edit' }))

    expect(screen.getByRole('menu', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.queryByRole('menu', { name: 'File' })).toBeNull()
  })

  it('closes on its own trigger, as a menu should', async () => {
    bar()
    const trigger = screen.getByRole('button', { name: 'File' })

    await userEvent.click(trigger)
    await userEvent.click(trigger)

    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on Escape', async () => {
    bar()
    await userEvent.click(screen.getByRole('button', { name: 'File' }))
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('marks the open menu on its button, so the bar says which is showing', async () => {
    bar()
    const trigger = screen.getByRole('button', { name: 'File' })
    await userEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('changes the theme from the View menu', async () => {
    bar()
    await userEvent.click(screen.getByRole('button', { name: 'View' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: /Dark theme/ }))

    expect(document.documentElement.dataset.theme).toBe('dark')
    // Activating an item closes the menu.
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('changes the layout of the page it was given', async () => {
    bar()
    await userEvent.click(screen.getByRole('button', { name: 'View' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: /Two columns/ }))

    expect(useChrome.getState().layoutByPage['data-explorer']).toBe('columns')
  })

  it('does nothing when a placeholder is clicked', async () => {
    bar()
    await userEvent.click(screen.getByRole('button', { name: 'File' }))
    const item = screen.getByRole('menuitem', { name: /New index/ })

    expect(item).toBeDisabled()
    await userEvent.click(item)
    // Still open: a disabled item is inert, not a dismissal.
    expect(screen.getByRole('menu', { name: 'File' })).toBeInTheDocument()
  })

  it('walks to the first item a keyboard can actually use', async () => {
    // File is entirely placeholders, so ArrowDown has nowhere to land and
    // must not focus a disabled item.
    bar()
    await userEvent.click(screen.getByRole('button', { name: 'View' }))
    await userEvent.keyboard('{ArrowDown}')

    expect(screen.getByRole('menuitemradio', { name: /Light theme/ })).toHaveFocus()
  })
})
