import { afterEach, describe, expect, it, vi } from 'vitest'
import { assistantShips, pageShips, viewShips } from './release'
import { clearViews, registerView } from './viewRegistry'

/**
 * What a release build leaves out (BU-209): the AI assistant and the
 * Optimiser, Derivatives and Reports pages, which stay in `pnpm dev`.
 */

function asRelease(releaseBuild: boolean): void {
  vi.stubGlobal('beacon', { releaseBuild })
}

afterEach(() => {
  vi.unstubAllGlobals()
  clearViews()
})

describe('a release build', () => {
  it('ships the loop, and leaves the unfinished pages out', () => {
    asRelease(true)
    for (const page of ['data-explorer', 'strategy-builder', 'beacon-view']) {
      expect(pageShips(page)).toBe(true)
    }
    for (const page of ['optimiser', 'derivatives', 'reports']) {
      expect(pageShips(page)).toBe(false)
    }
    expect(assistantShips()).toBe(false)
  })

  it('leaves out a view with its page, so a saved tab cannot reach it', () => {
    asRelease(true)
    registerView('frontier', () => null, {
      page: 'optimiser',
      title: 'Frontier',
      archetype: 'query'
    })
    registerView('weights', () => null, {
      page: 'beacon-view',
      title: 'Weights',
      archetype: 'query'
    })

    expect(viewShips('frontier')).toBe(false)
    expect(viewShips('weights')).toBe(true)
  })
})

describe('a development build', () => {
  it('keeps everything, since that is where the unfinished parts are built', () => {
    asRelease(false)
    expect(pageShips('optimiser')).toBe(true)
    expect(assistantShips()).toBe(true)
  })

  it('treats no bridge at all as development, as storybook and tests run', () => {
    expect(pageShips('reports')).toBe(true)
  })
})
