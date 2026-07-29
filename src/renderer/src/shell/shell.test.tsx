import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { Footer } from './Footer'
import { MenuBar } from './MenuBar'
import { Sidebar } from './Sidebar'
import { GUIDES_PAGE, MENUS, SIDEBAR_PAGES } from './pages'

describe('Sidebar', () => {
  it('renders six section icons plus Guides', () => {
    render(<Sidebar />)

    expect(SIDEBAR_PAGES).toHaveLength(6)
    for (const page of [...SIDEBAR_PAGES, GUIDES_PAGE]) {
      expect(screen.getByRole('button', { name: page.label })).toBeInTheDocument()
    }
  })

  it('marks the active page for assistive tech, not just visually', () => {
    render(<Sidebar activeId="beacon-view" />)

    expect(screen.getByRole('button', { name: 'Beacon View' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('button', { name: 'Reports' })).not.toHaveAttribute('aria-current')
  })

  it('applies the wash to exactly one item', () => {
    const { container } = render(<Sidebar activeId="optimiser" />)
    expect(container.querySelectorAll('.sidebar-active')).toHaveLength(1)
  })

  it('can activate Guides, which lives outside the section list', () => {
    const { container } = render(<Sidebar activeId="guides" />)
    expect(container.querySelectorAll('.sidebar-active')).toHaveLength(1)
  })

  it('reports selection', async () => {
    const onSelect = vi.fn()
    render(<Sidebar onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('button', { name: 'Data Explorer' }))

    expect(onSelect).toHaveBeenCalledWith('data-explorer')
  })

  it('labels every icon, since the sidebar carries no visible text', () => {
    const { container } = render(<Sidebar />)
    for (const button of container.querySelectorAll('.sidebar-item')) {
      expect(button.getAttribute('aria-label')).toBeTruthy()
    }
  })
})

describe('MenuBar', () => {
  it('renders all nine menus', () => {
    render(<MenuBar />)
    for (const menu of MENUS) {
      expect(screen.getByRole('button', { name: menu })).toBeInTheDocument()
    }
  })

  it('omits window controls, which belong to the OS frame (see #37)', () => {
    render(<MenuBar />)

    for (const name of [/minimi[sz]e/i, /maximi[sz]e/i, /^close$/i]) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
  })

  it('emits the search query on Enter only', async () => {
    const onSearch = vi.fn()
    render(<MenuBar onSearch={onSearch} />)

    const input = screen.getByRole('searchbox', { name: 'Search' })
    await userEvent.type(input, 'AAPL')
    expect(onSearch).not.toHaveBeenCalled()

    await userEvent.type(input, '{Enter}')
    expect(onSearch).toHaveBeenCalledWith('AAPL')
  })

  it('wires the assistant toggle', async () => {
    const onToggleAssistant = vi.fn()
    render(<MenuBar onToggleAssistant={onToggleAssistant} />)

    await userEvent.click(screen.getByRole('button', { name: 'AI assistant' }))

    expect(onToggleAssistant).toHaveBeenCalled()
  })
})

describe('Footer', () => {
  it('states the engine version when connected', () => {
    render(<Footer engine={{ state: 'connected', version: '0.0.2' }} />)
    expect(screen.getByText(/engine connected · py-beacon 0.0.2/)).toBeInTheDocument()
  })

  it('says unavailable rather than pretending, when degraded', () => {
    const { container } = render(<Footer engine={{ state: 'degraded' }} />)

    expect(screen.getByText(/engine unavailable/)).toBeInTheDocument()
    expect(container.querySelector('.dot-danger')).not.toBeNull()
  })

  it('hides the data slot until there is freshness to report', () => {
    render(<Footer />)
    expect(screen.queryByText(/data updated/)).toBeNull()
  })

  it('shows the update notice only when one is available', () => {
    const { rerender } = render(<Footer version="0.0.1" />)
    expect(screen.queryByText('update available')).toBeNull()

    rerender(<Footer version="0.0.1" updateAvailable />)
    expect(screen.getByText('update available')).toBeInTheDocument()
  })
})

describe('AppShell', () => {
  it('stacks menu bar, middle band and footer', () => {
    const { container } = render(<AppShell>pane</AppShell>)

    expect(container.querySelector('.menu-bar')).not.toBeNull()
    expect(container.querySelector('.sidebar')).not.toBeNull()
    expect(container.querySelector('.footer')).not.toBeNull()
    expect(container.querySelector('.app-shell-pane')).toHaveTextContent('pane')
  })

  it('omits the assistant rail until it is opened', () => {
    const { container, rerender } = render(<AppShell>pane</AppShell>)
    expect(container.querySelector('.app-shell-assistant')).toBeNull()

    rerender(<AppShell assistant={<div>transcript</div>}>pane</AppShell>)
    expect(container.querySelector('.app-shell-assistant')).not.toBeNull()
  })

  it('exposes the pane as the main landmark', () => {
    render(<AppShell>pane</AppShell>)
    expect(screen.getByRole('main')).toHaveTextContent('pane')
  })
})
