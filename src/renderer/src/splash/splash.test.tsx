import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { EngineState } from '@shared/ipc'
import { Splash } from './Splash'
import { splashProgress } from './splashProgress'

/**
 * The bar tracks the engine's real startup rather than being animated to look
 * busy — BU-57 added a step that genuinely takes a while on first run, and
 * that is the one moment the user actually waits.
 */
describe('splashProgress', () => {
  const at = (engine: EngineState): ReturnType<typeof splashProgress> => splashProgress(engine)

  it('starts before the engine has said anything', () => {
    expect(at({ status: 'starting' })).toMatchObject({ fraction: 0.2, ready: false })
  })

  it('names generation, which is the slow one', () => {
    // Inferred from `detail` rather than a new channel: the engine already
    // says what it is doing and a second source could disagree with it.
    const generating = at({
      status: 'starting',
      detail: 'generating synthetic data — first run only'
    })

    expect(generating.label).toBe('Generating market data…')
    expect(generating.fraction).toBe(0.5)
  })

  it('separates spawning from waiting for an answer', () => {
    // `baseUrl` appears only once the server has announced its port, which is
    // the one observable difference between the two.
    expect(at({ status: 'starting', baseUrl: 'http://127.0.0.1:1' }).fraction).toBe(0.8)
  })

  it('reports ready exactly once, when the engine connects', () => {
    expect(at({ status: 'connected' })).toMatchObject({ fraction: 1, ready: true })
    expect(at({ status: 'starting' }).ready).toBe(false)
  })

  it('stops pretending to progress when startup failed', () => {
    const failed = at({ status: 'stopped', detail: 'server exited with code 2' })

    expect(failed).toMatchObject({ failed: true, ready: false })
    // The reason, not a generic message — the user can act on one of those.
    expect(failed.label).toBe('server exited with code 2')
  })

  it('does not call a reconnect a failure', () => {
    // degraded means a restart is in flight; saying "could not be started"
    // would be the lie BU-19 exists to prevent.
    expect(at({ status: 'degraded' })).toMatchObject({ failed: false, ready: false })
  })
})

describe('Splash', () => {
  it('carries the licence, which is the only place the app states it', () => {
    render(<Splash version="0.0.1" />)

    expect(screen.getByText(/not.*investment advice/i)).toBeInTheDocument()
    expect(screen.getByText(/MIT License/)).toBeInTheDocument()
  })

  it('shows the version and a way out', () => {
    render(<Splash version="0.0.1" />)

    expect(screen.getByText('version 0.0.1')).toBeInTheDocument()
    // A button rather than a link since BU-112: an `<a href>` navigated this
    // very window to GitHub, which in a frameless window is a dead end.
    expect(screen.getByRole('button', { name: 'Repository' })).toBeInTheDocument()
  })

  it('reports startup as a progressbar, not just as text', () => {
    render(<Splash version="0.0.1" />)
    expect(screen.getByRole('progressbar', { name: 'Startup' })).toBeInTheDocument()
  })

  it('waits for Start rather than handing over the moment the engine is up', async () => {
    // BU-111. It used to call `splashDone` from an effect the instant the
    // engine reported ready, so the app appeared whenever startup happened to
    // finish — including part-way through changing where the data comes from.
    const splashDone = vi.fn(() => Promise.resolve())
    vi.stubGlobal('beacon', {
      engine: {
        state: () => Promise.resolve({ status: 'connected' }),
        onChange: () => () => undefined
      },
      update: { state: () => Promise.resolve({ status: 'idle' }), onChange: () => () => undefined },
      data: { openSettingsWindow: () => Promise.resolve() },
      window: {
        splashDone,
        isMaximized: () => Promise.resolve(false),
        onMaximizeChange: () => () => undefined
      }
    })

    render(<Splash version="0.0.1" />)
    await screen.findByText('Ready')
    expect(splashDone).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(splashDone).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('will not start before the engine can serve', () => {
    // Pressing Start on a dead engine would open an app with nothing behind
    // it, which is worse than waiting on a screen that says why.
    render(<Splash version="0.0.1" />)
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
  })

  it('offers the data settings, which is the point of waiting', async () => {
    const openSettingsWindow = vi.fn(() => Promise.resolve())
    vi.stubGlobal('beacon', {
      engine: {
        state: () => Promise.resolve({ status: 'starting' }),
        onChange: () => () => undefined
      },
      update: { state: () => Promise.resolve({ status: 'idle' }), onChange: () => () => undefined },
      data: { openSettingsWindow },
      window: { isMaximized: () => Promise.resolve(false), onMaximizeChange: () => () => undefined }
    })

    render(<Splash version="0.0.1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Data settings…' }))

    expect(openSettingsWindow).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
