import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppInfo, EngineState } from '@shared/ipc'
import { App } from './App'
import { useWorkspace } from './state/tabs.store'

const INFO: AppInfo = {
  version: '0.0.1',
  electron: '33.4.11',
  chrome: '130.0.0.0',
  node: '20.18.1',
  platform: 'win32'
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/** Engine state the bridge reports; the footer renders this, not app info. */
function stubBridge(
  appInfo: () => Promise<AppInfo>,
  engine: EngineState = { status: 'connected', version: '0.0.2' }
): void {
  vi.stubGlobal('beacon', {
    appInfo,
    engine: {
      state: () => Promise.resolve(engine),
      restart: () => Promise.resolve(),
      onChange: () => () => undefined
    }
  })
}

beforeEach(() => {
  localStorage.clear()
  useWorkspace.getState().reset()
  stubBridge(() => Promise.resolve(INFO))
})

describe('App boots the real shell', () => {
  it('renders the shell chrome, not the scaffold demo', () => {
    const { container } = render(<App />)

    expect(container.querySelector('.menu-bar')).not.toBeNull()
    expect(container.querySelector('.sidebar')).not.toBeNull()
    expect(container.querySelector('.footer')).not.toBeNull()
    expect(container.querySelector('.home')).not.toBeNull()
  })

  it('opens on Home, with no sidebar page claimed (BU-54)', () => {
    // Home is not a sidebar destination: measured against frame 2:3, its
    // Sidebar instance highlights no slot where every workspace page's does.
    const { container } = render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
    expect(container.querySelectorAll('.sidebar-active')).toHaveLength(0)
    expect(container.querySelector('.pane-host')).toBeNull()
  })

  it('leaves Home for a sidebar page, and comes back via the logo', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Beacon View' }))
    expect(screen.queryByRole('heading', { level: 1, name: 'Home' })).toBeNull()
    expect(screen.getByRole('button', { name: 'New tab' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
  })

  it('opens every page empty, with nothing the user did not ask for (BU-59)', async () => {
    render(<App />)

    for (const page of ['Beacon View', 'Data Explorer', 'Reports']) {
      await userEvent.click(screen.getByRole('button', { name: page }))
      expect(screen.queryAllByRole('tab')).toHaveLength(0)
      expect(screen.getByText(/Nothing open here yet/)).toBeInTheDocument()
    }
  })

  it('keeps a page as the user left it when switching away and back', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Derivatives' }))
    await userEvent.click(screen.getByRole('button', { name: 'New tab' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Futures' }))
    expect(screen.getByRole('button', { name: /^Futures/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reports' }))
    expect(screen.queryByRole('button', { name: /^Futures/ })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Derivatives' }))
    expect(screen.getByRole('button', { name: /^Futures/ })).toBeInTheDocument()
  })
})

describe('engine state reaches the footer (BU-19)', () => {
  it('reports the py-beacon version once connected', async () => {
    render(<App />)
    expect(await screen.findByText(/engine connected · py-beacon 0.0.2/)).toBeInTheDocument()
  })

  it('says reconnecting while degraded, not merely unavailable', async () => {
    stubBridge(() => Promise.resolve(INFO), { status: 'degraded', detail: 'server exited (1)' })

    render(<App />)

    expect(await screen.findByText(/engine unavailable · reconnecting/)).toBeInTheDocument()
  })

  it('distinguishes stopped from degraded, so it cannot claim to be recovering forever', async () => {
    stubBridge(() => Promise.resolve(INFO), { status: 'stopped', detail: 'gave up' })

    render(<App />)

    expect(await screen.findByText('engine stopped')).toBeInTheDocument()
    expect(screen.queryByText(/reconnecting/)).toBeNull()
  })

  it('shows starting rather than optimistically claiming connected', () => {
    const pending = deferred<AppInfo>()
    stubBridge(() => pending.promise, { status: 'starting' })

    render(<App />)

    expect(screen.getByText(/engine starting/)).toBeInTheDocument()
  })

  it('survives a missing bridge, and says the engine is stopped', async () => {
    vi.stubGlobal('beacon', undefined)

    const { container } = render(<App />)

    expect(await screen.findByText('engine stopped')).toBeInTheDocument()
    // The shell must still render without an engine.
    expect(container.querySelector('.home')).not.toBeNull()
  })

  it('reports beacon-ui version separately from py-beacon version', async () => {
    render(<App />)

    // App info gives 0.0.1 (the client); the engine reports 0.0.2 (the server).
    expect(await screen.findByText(/py-beacon 0.0.2/)).toBeInTheDocument()
    expect(screen.getByText(/version 0.0.1/)).toBeInTheDocument()
  })
})

describe('assistant rail', () => {
  it('is closed until the menu bar toggle is used', async () => {
    const { container } = render(<App />)
    expect(container.querySelector('.app-shell-assistant')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'AI assistant' }))
    expect(container.querySelector('.app-shell-assistant')).not.toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Close assistant' }))
    expect(container.querySelector('.app-shell-assistant')).toBeNull()
  })
})

describe('theme', () => {
  /**
   * The picker is deliberately absent: it was never in the mockup, and it
   * belongs in the footer once that frame exists (see the follow-up issue).
   * The app still themes itself — it just follows the OS with no override.
   */
  it('renders no theme picker in the menu bar', () => {
    render(<App />)
    expect(screen.queryByRole('radiogroup', { name: 'Theme' })).toBeNull()
  })
})
