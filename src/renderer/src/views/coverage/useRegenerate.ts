import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export interface RegenerateState {
  run: () => Promise<void>
  /** True from the confirmation until the engine is back. */
  busy: boolean
  /** Set when it refused or failed. Cancelling is neither. */
  problem: string | undefined
}

/**
 * Replace the synthetic data store (BU-107).
 *
 * Everything real happens in main — it owns the engine's lifecycle and the
 * python that can see the store. This is the button's half: ask, then throw
 * away every cached answer, because they all describe a dataset that no
 * longer exists.
 */
export function useRegenerate(): RegenerateState {
  const queries = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | undefined>(undefined)

  const run = useCallback(async (): Promise<void> => {
    const bridge = globalThis.window.beacon
    if (bridge === undefined) {
      setProblem('Replacing the data store needs the desktop app.')
      return
    }

    setBusy(true)
    setProblem(undefined)
    try {
      const result = await bridge.engine.regenerate()
      if (result.problem !== undefined) setProblem(result.problem)
      // Every query in the cache describes the old dataset — identifiers,
      // coverage, universes, the lot. Invalidating the world is the honest
      // response to the world having changed.
      if (result.started) await queries.invalidateQueries()
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [queries])

  return { run, busy, problem }
}
