import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** One combination of keys pressed together: ['Ctrl', 'K']. */
export type KeyCombo = readonly string[]
/** Combinations pressed one after another: Ctrl+K then Alt. */
export type Shortcut = readonly KeyCombo[]

interface ShortcutsState {
  /**
   * The shortcuts assigned in Settings, by action; the rest keep their own.
   * An empty one is a shortcut taken away by another action's.
   */
  assigned: Record<string, Shortcut>
  /** Give `id` its shortcut, taking it from the actions in `taking`. */
  assign: (id: string, shortcut: Shortcut, taking?: readonly string[]) => void
  /** Back to the action's own shortcut, taking it from the actions in `taking`. */
  reset: (id: string, taking?: readonly string[]) => void
}

/** Shortcuts assigned in Settings → Keyboard shortcuts (Karan), kept across restarts. */
export const useShortcuts = create<ShortcutsState>()(
  persist(
    (set) => ({
      assigned: {},
      assign: (id, shortcut, taking = []) => {
        set((state) => ({ assigned: { ...state.assigned, ...none(taking), [id]: shortcut } }))
      },
      reset: (id, taking = []) => {
        set((state) => {
          const others = Object.fromEntries(
            Object.entries(state.assigned).filter(([action]) => action !== id)
          )
          return { assigned: { ...others, ...none(taking) } }
        })
      }
    }),
    { name: 'beacon.shortcuts', version: 1 }
  )
)

function none(ids: readonly string[]): Record<string, Shortcut> {
  return Object.fromEntries(ids.map((id) => [id, []]))
}
