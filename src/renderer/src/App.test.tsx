import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AppInfo } from '@shared/ipc'
import { App } from './App'

const INFO: AppInfo = {
  version: '0.0.1',
  electron: '33.4.11',
  chrome: '130.0.0.0',
  node: '20.18.1'
}

/** A promise plus its resolver, so a test can hold the bridge open. */
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

describe('App', () => {
  it('shows the pending state while the bridge is in flight', () => {
    const pending = deferred<AppInfo>()
    stubBridge(() => pending.promise)

    render(<App />)

    expect(screen.getByText('bridge: waiting')).toBeInTheDocument()
  })

  it('renders versions once the bridge responds', async () => {
    stubBridge(() => Promise.resolve(INFO))

    render(<App />)

    expect(await screen.findByText(/bridge ok/)).toHaveTextContent('beacon 0.0.1')
  })

  it('degrades instead of unmounting when the bridge rejects', async () => {
    // An uncaught throw in the effect tears down the whole tree and leaves a
    // blank window. The demo must still be on screen.
    stubBridge(() => Promise.reject(new Error('no handler registered')))

    render(<App />)

    expect(await screen.findByText('bridge: unavailable')).toBeInTheDocument()
    expect(screen.getByText('Tokens')).toBeInTheDocument()
  })

  it('degrades when the bridge is missing entirely', async () => {
    vi.stubGlobal('beacon', undefined)

    render(<App />)

    expect(await screen.findByText('bridge: unavailable')).toBeInTheDocument()
    expect(screen.getByText('Tokens')).toBeInTheDocument()
  })
})

describe('theme switching (BU-4 acceptance)', () => {
  it('restyles by setting data-theme on the root, nothing else', async () => {
    stubBridge(() => Promise.resolve(INFO))
    render(<App />)

    expect(document.documentElement.dataset.theme).toBe('dark')

    await userEvent.click(screen.getByRole('button', { name: 'dark' }))
    expect(document.documentElement.dataset.theme).toBe('light')

    await userEvent.click(screen.getByRole('button', { name: 'light' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
