import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Assumption values by name, as the backtest form holds them: text, '' for unset. */
export type AssumptionValues = Record<string, string>

interface ModellingDefaultsState {
  assumptions: AssumptionValues
  setAssumption: (name: string, value: string) => void
  /** Back to py-beacon's own defaults: nothing set here at all. */
  reset: () => void
}

/**
 * Analysis → Modelling assumptions (BU-272): the app's own defaults, kept
 * across restarts as Data Preferences are.
 *
 * Only what was set is kept. An assumption left blank takes py-beacon's
 * default, so a later engine that changes one is followed rather than
 * overridden by a copy taken today.
 */
export const useModellingDefaults = create<ModellingDefaultsState>()(
  persist(
    (set) => ({
      assumptions: {},
      setAssumption: (name, value) => {
        set((state) => ({ assumptions: withValue(state.assumptions, name, value) }))
      },
      reset: () => {
        set({ assumptions: {} })
      }
    }),
    {
      name: 'beacon.modelling-assumptions',
      version: 1,
      partialize: (state) => ({ assumptions: state.assumptions }),
      merge: (persisted, current) => ({ ...current, assumptions: textValues(persisted) })
    }
  )
)

function withValue(values: AssumptionValues, name: string, value: string): AssumptionValues {
  if (value !== '') return { ...values, [name]: value }
  return Object.fromEntries(Object.entries(values).filter(([key]) => key !== name))
}

/** A stored value read back as text only, so a hand-edited one cannot reach a form as an object. */
function textValues(persisted: unknown): AssumptionValues {
  const stored = (persisted as { assumptions?: unknown } | undefined)?.assumptions
  if (typeof stored !== 'object' || stored === null) return {}
  return Object.fromEntries(
    Object.entries(stored).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''
    )
  )
}
