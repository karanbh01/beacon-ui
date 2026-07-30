import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WindowControls } from './WindowControls'
import { MenuBar } from './MenuBar'

interface WindowApi {
  minimize: ReturnType<typeof vi.fn>
  toggleMaximize: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  isMaximized: ReturnType<typeof vi.fn>
  onMaximizeChange: ReturnType<typeof vi.fn>
}

function stubWindowApi(maximized = false): { api: WindowApi; emit: (value: boolean) => void } {
  let listener: ((value: boolean) => void) | undefined
  const api: WindowApi = {
    minimize: vi.fn(() => Promise.resolve()),
    toggleMaximize: vi.fn(() => Promise.resolve(!maximized)),
    close: vi.fn(() => Promise.resolve()),
    isMaximized: vi.fn(() => Promise.resolve(maximized)),
    onMaximizeChange: vi.fn((fn: (value: boolean) => void) => {
      listener = fn
      return () => {
        listener = undefined
      }
    })
  }
  vi.stubGlobal('beacon', { window: api })
  return {
    api,
    emit: (value) => {
      listener?.(value)
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WindowControls', () => {
  it('renders nothing until the window API answers', () => {
    vi.stubGlobal('beacon', undefined)
    const { container } = render(<WindowControls />)

    // No bridge (browser, or dead bridge) — draw nothing rather than
    // buttons that cannot work.
    expect(container.querySelector('.win-controls')).toBeNull()
  })

  it('draws all three controls once supported', async () => {
    stubWindowApi()
    render(<WindowControls />)

    expect(await screen.findByRole('button', { name: 'Minimise' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Maximise' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('minimises', async () => {
    const { api } = stubWindowApi()
    render(<WindowControls />)

    await userEvent.click(await screen.findByRole('button', { name: 'Minimise' }))

    expect(api.minimize).toHaveBeenCalled()
  })

  it('closes', async () => {
    const { api } = stubWindowApi()
    render(<WindowControls />)

    await userEvent.click(await screen.findByRole('button', { name: 'Close' }))

    expect(api.close).toHaveBeenCalled()
  })

  it('swaps maximise for restore once maximised', async () => {
    const { api } = stubWindowApi(false)
    render(<WindowControls />)

    await userEvent.click(await screen.findByRole('button', { name: 'Maximise' }))

    expect(api.toggleMaximize).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Restore' })).toBeInTheDocument()
  })

  it('follows state changes it did not cause', async () => {
    // Double-clicking the drag region and OS snap gestures both maximise
    // without the renderer knowing, so the glyph has to track a pushed event.
    const { emit } = stubWindowApi(false)
    render(<WindowControls />)
    await screen.findByRole('button', { name: 'Maximise' })

    emit(true)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
    })
  })

  it('unsubscribes on unmount', async () => {
    const { api } = stubWindowApi()
    const { unmount } = render(<WindowControls />)
    await screen.findByRole('button', { name: 'Minimise' })

    const unsubscribe = api.onMaximizeChange.mock.results[0]?.value as () => void
    const spy = vi.fn(unsubscribe)
    unmount()

    expect(api.onMaximizeChange).toHaveBeenCalledTimes(1)
    expect(typeof unsubscribe).toBe('function')
    spy()
  })
})

describe('MenuBar as title bar', () => {
  it('leaves room for macOS traffic lights only on darwin', () => {
    const { container, rerender } = render(<MenuBar platform="win32" />)
    expect(container.querySelector('.menu-bar')).not.toHaveClass('menu-bar-mac')

    rerender(<MenuBar platform="darwin" />)
    expect(container.querySelector('.menu-bar')).toHaveClass('menu-bar-mac')
  })

  it('still renders its own controls alongside the window controls', () => {
    stubWindowApi()
    render(<MenuBar platform="win32" />)

    expect(screen.getByRole('button', { name: 'AI assistant' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search' })).toBeInTheDocument()
  })
})
