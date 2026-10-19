import { useState, type Dispatch, type SetStateAction } from 'react'
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
  strategyId: string,
  options: BacktestOptions | undefined
): BacktestSetupState {
  const latest = useRunResult(strategyId)
  const [setup, setSetup] = useState<BacktestSetup>(DEFAULT_SETUP)
  const [origin, setOrigin] = useState<SetupOrigin>('defaults')

  const settings = latest.data?.settings
  if (origin === 'defaults' && settings != null && options !== undefined) {
    setOrigin('run')
    setSetup(setupFromRun(settings, options))
  }

  return {
    setup,
    edit: (change) => {
      if (origin === 'defaults') setOrigin('edited')
      setSetup(change)
    },
    origin,
    startAfresh: () => {
      setOrigin('edited')
      setSetup(DEFAULT_SETUP)
    }
  }
}
