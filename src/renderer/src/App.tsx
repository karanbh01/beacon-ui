import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/ipc'

/**
 * Scaffold-only placeholder. It exists to prove three things end to end:
 * the renderer mounts, the preload bridge is reachable, and hot reload works.
 * The real shell arrives in BU-15.
 */
export function App(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void window.beacon.appInfo().then(setInfo)
  }, [])

  return (
    <main className="scaffold">
      <span className="mark">&beta;</span>
      <h1>beacon-ui</h1>
      <p className="sub">Scaffold - BU-1. Shell chrome lands in BU-15.</p>
      {info === null ? (
        <p className="bridge pending">bridge: waiting</p>
      ) : (
        <p className="bridge">
          bridge ok &middot; beacon {info.version} &middot; electron {info.electron} &middot; node{' '}
          {info.node}
        </p>
      )}
    </main>
  )
}
