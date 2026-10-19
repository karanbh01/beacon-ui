import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * The reference columns shown beside a ticker (Karan, 2026-10-19): one
 * default for every holdings table, set from Asset → Holding columns, and
 * a table's own choice where it has one.
 *
 * Kept as the engine's lower-case column names (`sector`,
 * `country_domicile`), which are what `reference_fields` takes and what the
 * rows come back keyed by (py-beacon 0.9.2, BN-325).
 */
export const DEFAULT_HOLDING_COLUMNS: readonly string[] = [
  'name',
  'asset_class',
  'sector',
  'country_domicile'
]

interface HoldingColumnsState {
  defaults: readonly string[]
  /** By table; absent where the table follows the default. */
  byTable: Readonly<Record<string, readonly string[]>>
  setDefaults: (columns: readonly string[]) => void
  /** `undefined` puts the table back on the default. */
  setTable: (table: string, columns: readonly string[] | undefined) => void
}

export const useHoldingColumnsStore = create<HoldingColumnsState>()(
  persist(
    (set) => ({
      defaults: DEFAULT_HOLDING_COLUMNS,
      byTable: {},
      setDefaults: (columns) => {
        set({ defaults: [...columns] })
      },
      setTable: (table, columns) => {
        set((state) => {
          const rest = Object.fromEntries(
            Object.entries(state.byTable).filter(([key]) => key !== table)
          )
          return { byTable: columns === undefined ? rest : { ...rest, [table]: [...columns] } }
        })
      }
    }),
    {
      name: 'beacon.holding-columns',
      version: 1,
      partialize: (state) => ({ defaults: state.defaults, byTable: state.byTable }),
      merge: (persisted, current) => ({ ...current, ...sanitise(persisted) })
    }
  )
)

/** A stored value that is not a list of names falls back, rather than breaking every table. */
function sanitise(persisted: unknown): Partial<HoldingColumnsState> {
  if (typeof persisted !== 'object' || persisted === null) return {}
  const stored = persisted as { defaults?: unknown; byTable?: unknown }
  const names = (value: unknown): string[] | undefined =>
    Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined

  const byTable: Record<string, readonly string[]> = {}
  if (typeof stored.byTable === 'object' && stored.byTable !== null) {
    for (const [table, value] of Object.entries(stored.byTable)) {
      const chosen = names(value)
      if (chosen !== undefined) byTable[table] = chosen
    }
  }
  return { defaults: names(stored.defaults) ?? DEFAULT_HOLDING_COLUMNS, byTable }
}

/** The columns a table shows: its own choice, or the default. */
export function useTableColumns(table: string): readonly string[] {
  const own = useHoldingColumnsStore((state) => state.byTable[table])
  const defaults = useHoldingColumnsStore((state) => state.defaults)
  return own ?? defaults
}
