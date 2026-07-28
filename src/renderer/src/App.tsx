import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { AppInfo } from '@shared/ipc'
import type { ThemeMode } from './tokens/tokens'
import { TokenDemo } from './tokens/TokenDemo'

/**
 * Scaffold host for the BU-4 token demo. The toggle here does exactly one
 * thing — set `data-theme` on the root element — which is the whole
 * demonstration: no component takes a theme prop or re-reads a colour.
 *
 * Persisted light/dark/follow-OS switching is BU-5; the app shell is BU-15.
 */
type BridgeState = { status: 'pending' } | { status: 'ok'; info: AppInfo } | { status: 'failed' }

export function App(): ReactElement {
  const [bridge, setBridge] = useState<BridgeState>({ status: 'pending' })
  const [theme, setTheme] = useState<ThemeMode>('dark')

  useEffect(() => {
    // Never let a bridge failure escape this effect. An uncaught throw here
    // tears down the whole React tree and the user gets a blank window — the
    // one thing worse than a degraded status line. Matters more once BU-19
    // introduces a python process that can legitimately be down.
    const load = async (): Promise<void> => {
      try {
        setBridge({ status: 'ok', info: await window.beacon.appInfo() })
      } catch {
        setBridge({ status: 'failed' })
      }
    }
    void load()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <main className="scaffold">
      <div className="scaffold-bar">
        <span className="mark">&beta;</span>
        <h1>beacon-ui</h1>
        <p className="sub">Token demo &middot; BU-4</p>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => {
            setTheme(theme === 'dark' ? 'light' : 'dark')
          }}
        >
          {theme}
        </button>
      </div>

      <TokenDemo />

      {bridge.status === 'pending' && <p className="bridge pending">bridge: waiting</p>}
      {bridge.status === 'failed' && <p className="bridge failed">bridge: unavailable</p>}
      {bridge.status === 'ok' && (
        <p className="bridge">
          bridge ok &middot; beacon {bridge.info.version} &middot; electron {bridge.info.electron}
        </p>
      )}
    </main>
  )
}
