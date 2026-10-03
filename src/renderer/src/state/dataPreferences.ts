import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_NUMBER_PREFERENCES,
  sanitisePreferences,
  type NumberPreferences
} from '../views/shared/largeNumbers'

interface DataPreferencesState extends NumberPreferences {
  setPreferences: (next: Partial<NumberPreferences>) => void
}

/**
 * Data Preferences (BU-228): kept across restarts, as a setting is, and the
 * same everywhere, as Karan asked — one choice for every table.
 *
 * Read back through `sanitisePreferences`, so a hand-edited or older stored
 * value falls back to the default rather than formatting numbers with a unit
 * that does not exist.
 */
export const useDataPreferences = create<DataPreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_NUMBER_PREFERENCES,
      setPreferences: (next) => {
        set((state) => sanitisePreferences({ unit: state.unit, decimals: state.decimals, ...next }))
      }
    }),
    {
      name: 'beacon.data-preferences',
      version: 1,
      partialize: (state) => ({ unit: state.unit, decimals: state.decimals }),
      merge: (persisted, current) => ({ ...current, ...sanitisePreferences(persisted) })
    }
  )
)

/** The current choice, for a formatter. */
export function useNumberPreferences(): NumberPreferences {
  const unit = useDataPreferences((state) => state.unit)
  const decimals = useDataPreferences((state) => state.decimals)
  return { unit, decimals }
}
