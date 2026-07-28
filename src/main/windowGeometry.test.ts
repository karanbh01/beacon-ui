import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STATE,
  MIN_HEIGHT,
  MIN_WIDTH,
  isReachable,
  parseWindowState,
  resolveBounds,
  type Bounds
} from './windowGeometry'

const PRIMARY: Bounds = { x: 0, y: 0, width: 2560, height: 1400 }
const SECONDARY: Bounds = { x: 2560, y: 0, width: 1920, height: 1080 }

describe('parseWindowState', () => {
  it('falls back to defaults for non-objects', () => {
    expect(parseWindowState(null)).toEqual(DEFAULT_STATE)
    expect(parseWindowState('nonsense')).toEqual(DEFAULT_STATE)
    expect(parseWindowState(undefined)).toEqual(DEFAULT_STATE)
  })

  it('keeps the maximized flag even when bounds are unusable', () => {
    expect(parseWindowState({ maximized: true })).toEqual({ bounds: null, maximized: true })
  })

  it('rejects bounds with missing or non-finite numbers', () => {
    const cases = [
      { x: 0, y: 0, width: 800 },
      { x: 0, y: 0, width: 800, height: 'tall' },
      { x: Number.NaN, y: 0, width: 800, height: 600 },
      { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 600 }
    ]
    for (const bounds of cases) {
      expect(parseWindowState({ bounds, maximized: false }).bounds).toBeNull()
    }
  })

  it('rejects non-positive dimensions', () => {
    const bounds = { x: 0, y: 0, width: 0, height: 600 }
    expect(parseWindowState({ bounds, maximized: false }).bounds).toBeNull()
  })

  it('accepts a well-formed state', () => {
    const bounds = { x: 100, y: 80, width: 1440, height: 1024 }
    expect(parseWindowState({ bounds, maximized: false })).toEqual({ bounds, maximized: false })
  })

  it('tolerates negative coordinates, which are valid on a left-of-primary display', () => {
    const bounds = { x: -1900, y: 40, width: 1440, height: 1024 }
    expect(parseWindowState({ bounds, maximized: false }).bounds).toEqual(bounds)
  })
})

describe('isReachable', () => {
  it('accepts a window fully inside a display', () => {
    expect(isReachable({ x: 100, y: 100, width: 1440, height: 1024 }, [PRIMARY])).toBe(true)
  })

  it('accepts a window straddling two displays', () => {
    const straddling: Bounds = { x: 2400, y: 100, width: 1440, height: 1024 }
    expect(isReachable(straddling, [PRIMARY, SECONDARY])).toBe(true)
  })

  it('rejects a window on a display that is no longer connected', () => {
    const onSecondary: Bounds = { x: 3000, y: 200, width: 1440, height: 1024 }
    expect(isReachable(onSecondary, [PRIMARY])).toBe(false)
  })

  it('rejects a window whose sliver of overlap is too small to grab', () => {
    const barelyOn: Bounds = { x: 2540, y: 100, width: 1440, height: 1024 }
    expect(isReachable(barelyOn, [PRIMARY])).toBe(false)
  })

  it('rejects a window scrolled off the top, where the title bar is unreachable', () => {
    const aboveScreen: Bounds = { x: 200, y: -1020, width: 1440, height: 1024 }
    expect(isReachable(aboveScreen, [PRIMARY])).toBe(false)
  })
})

describe('resolveBounds', () => {
  it('returns null when nothing was saved', () => {
    expect(resolveBounds(DEFAULT_STATE, [PRIMARY])).toBeNull()
  })

  it('returns null when saved bounds are unreachable, so defaults apply', () => {
    const state = { bounds: { x: 5000, y: 0, width: 1440, height: 1024 }, maximized: false }
    expect(resolveBounds(state, [PRIMARY])).toBeNull()
  })

  it('grows a saved size that is below the minimum', () => {
    const state = { bounds: { x: 10, y: 10, width: 800, height: 600 }, maximized: false }
    expect(resolveBounds(state, [PRIMARY])).toEqual({
      x: 10,
      y: 10,
      width: MIN_WIDTH,
      height: MIN_HEIGHT
    })
  })

  it('returns saved bounds unchanged when they are valid', () => {
    const bounds = { x: 120, y: 60, width: 1600, height: 1100 }
    expect(resolveBounds({ bounds, maximized: false }, [PRIMARY])).toEqual(bounds)
  })
})
