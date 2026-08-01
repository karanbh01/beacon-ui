import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '@shared/ipc'
import { Updater, sameUpdate, type UpdateFeed } from './updater'

/**
 * Stands in for electron-updater's `autoUpdater`.
 *
 * An EventEmitter, because that is what the real one is — driving the tests
 * by emitting its events means the transitions under test are the ones the
 * library actually triggers, not a paraphrase of them.
 */
class FakeFeed extends EventEmitter implements UpdateFeed {
  autoDownload = true
  checkForUpdates = vi.fn(() => Promise.resolve(undefined))
  downloadUpdate = vi.fn(() => Promise.resolve(undefined))
  quitAndInstall = vi.fn()
}

function harness(): { feed: FakeFeed; updater: Updater; states: UpdateState[] } {
  const feed = new FakeFeed()
  const updater = new Updater(feed)
  const states: UpdateState[] = []
  updater.on('change', (state: UpdateState) => states.push(state))
  return { feed, updater, states }
}

describe('Updater', () => {
  it('turns off automatic downloading', () => {
    // The installer is ~450 MB. Downloading that unasked is the behaviour
    // ADR-0004 exists to prevent, so it is asserted rather than assumed.
    const { feed } = harness()
    expect(feed.autoDownload).toBe(false)
  })

  it('walks check → available → downloading → ready', () => {
    const { feed, updater, states } = harness()

    updater.check()
    expect(updater.getState().status).toBe('checking')

    feed.emit('update-available', { version: '0.2.0' })
    expect(updater.getState()).toEqual({ status: 'available', version: '0.2.0' })

    updater.download()
    expect(feed.downloadUpdate).toHaveBeenCalledOnce()

    feed.emit('download-progress', { percent: 41.6 })
    expect(updater.getState()).toEqual({ status: 'downloading', percent: 42, version: '0.2.0' })

    feed.emit('update-downloaded', { version: '0.2.0' })
    expect(updater.getState()).toEqual({ status: 'ready', version: '0.2.0' })

    expect(states.map((state) => state.status)).toEqual([
      'checking',
      'available',
      'downloading',
      'downloading',
      'ready'
    ])
  })

  it('reports up to date as idle, not as a state worth announcing', () => {
    const { feed, updater } = harness()

    updater.check()
    feed.emit('update-not-available', { version: '0.0.1' })

    expect(updater.getState()).toEqual({ status: 'idle' })
  })

  it('does not download until asked', () => {
    const { feed, updater } = harness()

    updater.check()
    feed.emit('update-available', { version: '0.2.0' })

    expect(feed.downloadUpdate).not.toHaveBeenCalled()
  })

  it('ignores a download request when there is nothing on offer', () => {
    const { feed, updater } = harness()

    updater.download()

    expect(feed.downloadUpdate).not.toHaveBeenCalled()
    expect(updater.getState().status).toBe('idle')
  })

  it('refuses to install anything that has not finished downloading', () => {
    // quitAndInstall with nothing staged quits and does not come back: the
    // user would watch Beacon disappear.
    const { feed, updater } = harness()

    updater.install()
    updater.check()
    feed.emit('update-available', { version: '0.2.0' })
    updater.install()
    updater.download()
    updater.install()

    expect(feed.quitAndInstall).not.toHaveBeenCalled()

    feed.emit('update-downloaded', { version: '0.2.0' })
    updater.install()
    expect(feed.quitAndInstall).toHaveBeenCalledOnce()
  })

  it('will not restart a check while a download is in flight', () => {
    const { feed, updater } = harness()

    updater.check()
    feed.emit('update-available', { version: '0.2.0' })
    updater.download()
    feed.checkForUpdates.mockClear()

    updater.check()

    expect(feed.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.getState().status).toBe('downloading')
  })

  it('fails quietly when nobody asked', () => {
    // Offline is the usual reason a timed check fails, and the user can do
    // nothing about it. It is logged, not surfaced.
    const { feed, updater } = harness()
    const logs: string[] = []
    updater.on('log', (line: string) => logs.push(line))

    updater.check('auto')
    feed.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'))

    expect(updater.getState()).toEqual({ status: 'idle' })
    expect(logs).toEqual(['net::ERR_INTERNET_DISCONNECTED'])
  })

  it('says so when the user asked and it failed', () => {
    const { feed, updater } = harness()

    updater.check('user')
    feed.emit('error', new Error('404 latest.yml not found'))

    expect(updater.getState()).toEqual({
      status: 'error',
      detail: '404 latest.yml not found'
    })
  })

  it('does nothing at all without a feed', () => {
    // Development has no update metadata to read; every action must be inert
    // rather than throwing out of an IPC handler.
    const updater = new Updater()

    updater.start()
    updater.check()
    updater.download()
    updater.install()

    expect(updater.getState()).toEqual({ status: 'idle' })
  })

  it('checks on a timer once started', () => {
    vi.useFakeTimers()
    try {
      const { feed, updater } = harness()
      updater.start(1_000, 10_000)

      vi.advanceTimersByTime(1_000)
      expect(feed.checkForUpdates).toHaveBeenCalledTimes(1)

      feed.emit('update-not-available', { version: '0.0.1' })
      vi.advanceTimersByTime(20_000)
      expect(feed.checkForUpdates).toHaveBeenCalledTimes(3)

      updater.stop()
      vi.advanceTimersByTime(60_000)
      expect(feed.checkForUpdates).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('sameUpdate', () => {
  it('collapses a repeated state so the footer does not re-render on every tick', () => {
    expect(sameUpdate({ status: 'checking' }, { status: 'checking' })).toBe(true)
    expect(
      sameUpdate({ status: 'downloading', percent: 12 }, { status: 'downloading', percent: 13 })
    ).toBe(false)
  })
})
