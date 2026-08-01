import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/ipc'

/** The three things the footer can ask for. */
export type UpdateAction = 'check' | 'download' | 'install'

/**
 * Live update state from main (BU-34).
 *
 * Defaults to `idle` and stays there without a bridge, which is the truth in
 * Storybook and in a browser tab: there is no installed app to update.
 */
export function useUpdate(): UpdateState {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })

  useEffect(() => {
    const api = window.beacon?.update
    if (api === undefined) return undefined

    let live = true
    void api
      .state()
      .then((current) => {
        if (live) setState(current)
      })
      .catch(() => undefined)

    const unsubscribe = api.onChange(setState)
    return () => {
      live = false
      unsubscribe()
    }
  }, [])

  return state
}

/**
 * Fire an update action at main.
 *
 * Nothing is returned: main answers by pushing a new state, the same way it
 * does for a check nobody asked for.
 */
export function runUpdateAction(action: UpdateAction): void {
  const api = window.beacon?.update
  if (api === undefined) return
  void api[action]().catch(() => undefined)
}
