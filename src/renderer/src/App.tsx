import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { AppInfo } from '@shared/ipc'
import { TokenDemo } from './tokens/TokenDemo'
import { ThemeSwitch } from './state/ThemeSwitch'
import { useTheme } from './state/theme'

type BridgeState = { status: 'pending' } | { status: 'ok'; info: AppInfo } | { status: 'failed' }

/**
 * Scaffold host for the token demo and theme switch. Switching only ever sets
 * `data-theme` on the root element — no component takes a theme prop or
 * re-reads a colour, which is the point of BU-4.
 *
 * The app shell this eventually lives in is BU-15.
 */
export function App(): ReactElement {
  const [bridge, setBridge] = useState<BridgeState>({ status: 'pending' })
  const theme = useTheme()

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

  return (
    <main className="scaffold">
      <div className="scaffold-bar">
        <span className="mark">&beta;</span>
        <h1>beacon-ui</h1>
        <p className="sub">Token demo &middot; BU-4/BU-5</p>
        <ThemeSwitch {...theme} />
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
