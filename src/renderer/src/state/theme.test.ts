import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyMode,
  initTheme,
  readPreference,
  resolveMode,
  systemMode,
  watchSystemMode,
  writePreference
} from './theme'

type Listener = (event: { matches: boolean }) => void

/** Controllable stand-in for the prefers-color-scheme media query. */
function stubMatchMedia(prefersDark: boolean): { emit: (dark: boolean) => void } {
  const listeners = new Set<Listener>()
  vi.stubGlobal('matchMedia', () => ({
    matches: prefersDark,
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn)
  }))
  return {
    emit: (dark: boolean) => {
      for (const fn of listeners) fn({ matches: dark })
    }
  }
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readPreference', () => {
  it('defaults to system when nothing is stored', () => {
    expect(readPreference()).toBe('system')
  })

  it('round-trips each valid preference', () => {
    for (const preference of ['light', 'dark', 'system'] as const) {
      writePreference(preference)
      expect(readPreference()).toBe(preference)
    }
  })

  it('falls back to system when the stored value is garbage', () => {
    // A hand-edited or stale value must not leave the app unthemed.
    localStorage.setItem('beacon.theme', 'chartreuse')
    expect(readPreference()).toBe('system')
  })

  it('falls back to system when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage disabled')
      }
    })
    expect(readPreference()).toBe('system')
  })
})

describe('resolveMode', () => {
  it('passes explicit choices straight through', () => {
    stubMatchMedia(true)
    expect(resolveMode('light')).toBe('light')
    expect(resolveMode('dark')).toBe('dark')
  })

  it('defers to the OS for system', () => {
    stubMatchMedia(true)
    expect(resolveMode('system')).toBe('dark')

    stubMatchMedia(false)
    expect(resolveMode('system')).toBe('light')
  })
})

describe('systemMode', () => {
  it('reads the media query', () => {
    stubMatchMedia(false)
    expect(systemMode()).toBe('light')
  })
})

describe('applyMode', () => {
  it('sets data-theme on the root element', () => {
    applyMode('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

describe('initTheme', () => {
  it('applies the stored preference synchronously, before any paint', () => {
    stubMatchMedia(false)
    writePreference('dark')

    initTheme()

    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('applies the OS mode when following the system', () => {
    stubMatchMedia(true)
    writePreference('system')

    initTheme()

    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

describe('watchSystemMode', () => {
  it('reports OS changes and stops after unsubscribe', () => {
    const media = stubMatchMedia(false)
    const seen: string[] = []

    const unsubscribe = watchSystemMode((mode) => seen.push(mode))
    media.emit(true)
    media.emit(false)
    unsubscribe()
    media.emit(true)

    expect(seen).toEqual(['dark', 'light'])
  })
})
