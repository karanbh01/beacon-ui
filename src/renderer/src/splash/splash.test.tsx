import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

interface Stubs {
  start?: () => Promise<void>
  restart?: () => Promise<void>
  splashDone?: () => Promise<void>
  openSettingsWindow?: () => Promise<void>
}

/** The bridge, with only the calls a given test cares about spied on. */
function stub(engine: EngineState, calls: Stubs = {}): void {
  vi.stubGlobal('beacon', {
    engine: {
      state: () => Promise.resolve(engine),
      start: calls.start ?? (() => Promise.resolve()),
      restart: calls.restart ?? (() => Promise.resolve()),
      onChange: () => () => undefined
    },
    update: { state: () => Promise.resolve({ status: 'idle' }), onChange: () => () => undefined },
    data: { openSettingsWindow: calls.openSettingsWindow ?? (() => Promise.resolve()) },
    window: {
      splashDone: calls.splashDone ?? (() => Promise.resolve()),
      isMaximized: () => Promise.resolve(false),
      onMaximizeChange: () => () => undefined
    }
  })
}

describe('Splash', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

  it('starts the engine when Start is pressed, and not before', async () => {
    // BU-115. Nothing loads until the button is pressed: no python, no
    // generation. That is what makes the settings beside it worth having,
    // since a store location is only cheap to change before a store exists.
    const start = vi.fn(() => Promise.resolve())
    const splashDone = vi.fn(() => Promise.resolve())
    stub({ status: 'connected' }, { start, splashDone })

    render(<Splash version="0.0.1" />)
    await screen.findByText('Ready when you are')
    expect(start).not.toHaveBeenCalled()
    expect(splashDone).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('hands over once the engine it started is up', async () => {
    const splashDone = vi.fn(() => Promise.resolve())
    stub({ status: 'connected' }, { splashDone })

    render(<Splash version="0.0.1" />)
    // Ready, and still nothing: the hand-over is the second half of a press,
    // not something that happens on its own (BU-111).
    await screen.findByText('Ready when you are')
    expect(splashDone).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    await waitFor(() => {
      expect(splashDone).toHaveBeenCalledTimes(1)
    })
  })

  it('waits rather than handing over while the engine is still coming up', async () => {
    const splashDone = vi.fn(() => Promise.resolve())
    stub({ status: 'starting' }, { splashDone })

    render(<Splash version="0.0.1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))

    // The press moves the bar; it does not open an app with nothing behind it.
    await screen.findByText('Starting the engine…')
    expect(splashDone).not.toHaveBeenCalled()
  })

  it('turns into a retry when the engine gives up', async () => {
    const restart = vi.fn(() => Promise.resolve())
    stub({ status: 'stopped', detail: 'server exited with code 2' }, { restart })

    render(<Splash version="0.0.1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))

    // `stopped` is the engine having given up, so nothing moves again until
    // something explicitly restarts it.
    const retry = await screen.findByRole('button', { name: 'Try again' })
    await userEvent.click(retry)
    expect(restart).toHaveBeenCalledTimes(1)
  })

  it('offers the data settings, which is the point of waiting', async () => {
    const openSettingsWindow = vi.fn(() => Promise.resolve())
    stub({ status: 'starting' }, { openSettingsWindow })

    render(<Splash version="0.0.1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Data settings…' }))

    expect(openSettingsWindow).toHaveBeenCalledTimes(1)
  })
})
