import { render, screen } from '@testing-library/react'
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
})
