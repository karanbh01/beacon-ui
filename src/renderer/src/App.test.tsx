import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppInfo } from '@shared/ipc'
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

function stubBridge(appInfo: () => Promise<AppInfo>): void {
  vi.stubGlobal('beacon', { appInfo })
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
    expect(container.querySelector('.pane-host')).not.toBeNull()
  })

  it('opens on the first sidebar page with its seeded tabs', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: 'Data Explorer' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('button', { name: /^Prices/ })).toBeInTheDocument()
  })

  it('switches pages and shows that page tabs', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Beacon View' }))

    expect(screen.getByRole('button', { name: /^Weights/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Prices/ })).toBeNull()
  })

  it('seeds only an empty workspace, so closed tabs stay closed', () => {
    const first = render(<App />)
    useWorkspace.getState().closeTab('seed-prices')
    first.unmount()

    render(<App />)

    expect(screen.queryByRole('button', { name: /^Prices/ })).toBeNull()
  })
})

describe('bridge state reaches the footer', () => {
  it('reports starting while the bridge is in flight', () => {
    const pending = deferred<AppInfo>()
    stubBridge(() => pending.promise)

    render(<App />)

    expect(screen.getByText(/engine starting/)).toBeInTheDocument()
  })

  it('reports the version once connected', async () => {
    render(<App />)
    expect(await screen.findByText(/engine connected · py-beacon 0.0.1/)).toBeInTheDocument()
  })

  it('degrades rather than blanking when the bridge rejects', async () => {
    stubBridge(() => Promise.reject(new Error('no handler')))

    const { container } = render(<App />)

    expect(await screen.findByText(/engine unavailable/)).toBeInTheDocument()
    // The shell must survive a dead bridge.
    expect(container.querySelector('.pane-host')).not.toBeNull()
  })

  it('degrades when the bridge is missing entirely', async () => {
    vi.stubGlobal('beacon', undefined)

    render(<App />)

    expect(await screen.findByText(/engine unavailable/)).toBeInTheDocument()
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

describe('theme switching', () => {
  it('restyles by setting data-theme on the root, nothing else', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('radio', { name: 'dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')

    await userEvent.click(screen.getByRole('radio', { name: 'light' }))
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
