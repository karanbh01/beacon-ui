import { useEffect, useState } from 'react'
import type { EngineState } from '@shared/ipc'

/**
 * Live engine state from main (BU-19).
 *
 * Starts as `starting` rather than `connected`: an optimistic default would
 * make the footer claim a healthy engine for the first frame of every launch,
 * which is exactly the lie BU-19 exists to prevent.
 *
 * Outside Electron there is no bridge, so it reports `stopped` — Storybook and
 * a browser tab genuinely have no engine.
 */
export function useEngine(): EngineState {
  const [state, setState] = useState<EngineState>({ status: 'starting' })

  useEffect(() => {
    const api = window.beacon?.engine
    if (api === undefined) {
      setState({ status: 'stopped', detail: 'no bridge' })
      return undefined
    }

    let live = true
    void api
      .state()
      .then((current) => {
        if (live) setState(current)
      })
      .catch(() => {
        if (live) setState({ status: 'stopped', detail: 'engine unreachable' })
      })

    const unsubscribe = api.onChange(setState)
    return () => {
      live = false
      unsubscribe()
    }
  }, [])

  return state
}
