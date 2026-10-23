import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { useModellingDefaults } from '../../state/modellingDefaults'
import { useTabState } from '../../state/tabMemory'
import { useRunResult } from '../shared/beaconQueries'
import type { BacktestOptions } from '../shared/strategyDocuments'
import { setupFromRun } from './fromRun'
import { DEFAULT_SETUP, type BacktestSetup } from './setup'

/** Where the form's values came from, which the pane says. */
export type SetupOrigin = 'defaults' | 'run' | 'edited'

export interface BacktestSetupState {
  setup: BacktestSetup
  edit: Dispatch<SetStateAction<BacktestSetup>>
  origin: SetupOrigin
  /** Back to the engine's defaults, and no prefill after. */
  startAfresh: () => void
}

/**
 * The form, opened on the strategy's latest run when it has one (BN-322).
 *
 * Prefilled once, and only while nobody has typed: a run arriving after an
 * edit would overwrite what was typed, which is worse than an empty form.
 * Adjusted during render rather than in an effect, so the first paint with
 * the run in hand already shows its values instead of flashing the defaults.
 */
export function useBacktestSetup(
  tabId: string,
  strategyId: string,
  options: BacktestOptions | undefined
): BacktestSetupState {
  const latest = useRunResult(strategyId)
  // A new backtest starts from the app's own assumptions (BU-272); a run's
  // record keeps the ones it ran with, below.
  const defaults = useModellingDefaults((state) => state.assumptions)
  const fresh: BacktestSetup = { ...DEFAULT_SETUP, assumptions: defaults }
  // The tab's own, so a form half filled in is still there after a look at
  // another tab (Karan, 0.2.1); per strategy, as one's flows are not another's.
  const [setup, setSetup] = useTabState<BacktestSetup>(tabId, `backtest-setup:${strategyId}`, fresh)
  const [origin, setOrigin] = useTabState<SetupOrigin>(
    tabId,
    `backtest-origin:${strategyId}`,
    'defaults'
  )

  // Prefilled once from the last run, in an effect since the form is kept
  // in a store, and a store is not written during render.
  const settings = latest.data?.settings
  useEffect(() => {
    if (origin !== 'defaults' || settings == null || options === undefined) return
    setOrigin('run')
    setSetup(setupFromRun(settings, options))
  }, [origin, settings, options, setOrigin, setSetup])

  return {
    setup,
    edit: (change) => {
      if (origin === 'defaults') setOrigin('edited')
      setSetup(change)
    },
    origin,
    startAfresh: () => {
      setOrigin('edited')
      setSetup(fresh)
    }
  }
}
