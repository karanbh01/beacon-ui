import { useCallback, useEffect, useState } from 'react'
import type { ThemeMode } from '../tokens/tokens'

/** What the user chose. `system` defers to the OS and tracks it live. */
export type ThemePreference = 'light' | 'dark' | 'system'

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system']

const STORAGE_KEY = 'beacon.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function readPreference(): ThemePreference {
  try {
    const stored: unknown = localStorage.getItem(STORAGE_KEY)
    return isPreference(stored) ? stored : 'system'
  } catch {
    // Storage can throw when disabled. Following the OS is the safe default.
    return 'system'
  }
}

export function writePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // Persistence is a convenience; a failure must not break switching.
  }
}

export function systemMode(): ThemeMode {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

export function resolveMode(preference: ThemePreference): ThemeMode {
  return preference === 'system' ? systemMode() : preference
}

export function applyMode(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode
}

/**
 * Apply the stored theme before React mounts.
 *
 * Called at module scope in main.tsx rather than from an effect: an effect
 * runs after the first paint, so the window would flash the fallback palette
 * first. It cannot be an inline <script> either — the renderer CSP is
 * `script-src 'self'`, which blocks inline script outright.
 */
export function initTheme(): void {
  applyMode(resolveMode(readPreference()))
}

/**
 * Subscribe to OS theme changes. Returns an unsubscribe function.
 * Fires only while the preference is `system`; an explicit choice wins.
 */
export function watchSystemMode(onChange: (mode: ThemeMode) => void): () => void {
  const query = window.matchMedia(DARK_QUERY)
  const handler = (event: MediaQueryListEvent): void => {
    onChange(event.matches ? 'dark' : 'light')
  }
  query.addEventListener('change', handler)
  return () => {
    query.removeEventListener('change', handler)
  }
}

export interface ThemeControl {
  preference: ThemePreference
  /** The mode actually on screen, after resolving `system`. */
  mode: ThemeMode
  setPreference: (preference: ThemePreference) => void
}

export function useTheme(): ThemeControl {
  const [preference, setStored] = useState<ThemePreference>(readPreference)
  const [mode, setMode] = useState<ThemeMode>(() => resolveMode(readPreference()))

  const setPreference = useCallback((next: ThemePreference): void => {
    setStored(next)
    writePreference(next)
    const resolved = resolveMode(next)
    setMode(resolved)
    applyMode(resolved)
  }, [])

  useEffect(() => {
    if (preference !== 'system') return undefined
    return watchSystemMode((next) => {
      setMode(next)
      applyMode(next)
    })
  }, [preference])

  return { preference, mode, setPreference }
}

/** The mode currently on the root element. */
export function currentMode(): ThemeMode {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

/**
 * Track the mode that is actually applied, live.
 *
 * Reads the root attribute rather than the preference, and watches it, so a
 * canvas that cannot use CSS custom properties still repaints on a theme
 * change no matter what caused it — an explicit choice, the OS flipping, or
 * `initTheme` at boot. `useTheme` would give each caller its own copy of the
 * preference state, and two copies eventually disagree.
 */
export function useThemeMode(): ThemeMode {
  const [mode, setMode] = useState<ThemeMode>(currentMode)

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setMode(currentMode())
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })
    return () => {
      observer.disconnect()
    }
  }, [])

  return mode
}
