import { create } from 'zustand'
import type { WorkspaceState } from './tabs.types'

interface Pulse {
  page: string
  pane: number
  /** When it was asked for, so moving back to the same pane pulses again. */
  at: number
}

/** A window asked to open its new-tab menu, by Ctrl+T (BU-280). */
interface NewTabRequest {
  page: string
  pane: number
  at: number
}

interface CurrentPaneState {
  /** The pane each page's keyboard acts on, once one has been chosen. */
  byPage: Record<string, number | undefined>
  pulse: Pulse | undefined
  newTab: NewTabRequest | undefined
  /** Make `pane` the page's current one; `pulse` marks it on screen (BU-277). */
  choose: (page: string, pane: number, pulse?: boolean) => void
  /** Open `pane`'s new-tab menu, as its + would. */
  askNewTab: (page: string, pane: number) => void
}

/**
 * Which window the keyboard is in (BU-277). Ctrl+Left/Right move between its
 * tabs, so there has to be one, and it is the pane last clicked in or moved
 * to. Not kept across restarts: it is where you are, not a setting.
 */
export const useCurrentPane = create<CurrentPaneState>()((set) => ({
  byPage: {},
  pulse: undefined,
  newTab: undefined,
  askNewTab: (page, pane) => {
    set({ newTab: { page, pane, at: Date.now() } })
  },
  choose: (page, pane, pulse = false) => {
    set((state) => ({
      byPage: { ...state.byPage, [page]: pane },
      pulse: pulse ? { page, pane, at: Date.now() } : state.pulse
    }))
  }
}))

/**
 * The page's current pane: the one chosen, or before any was, the pane of
 * the tab last opened or selected there.
 */
export function currentPane(
  chosen: number | undefined,
  workspace: WorkspaceState,
  page: string,
  paneCount: number
): number {
  if (chosen !== undefined && chosen < paneCount) return chosen

  let latest: { pane: number; at: number } | undefined
  for (const tab of workspace.tabs) {
    if (tab.page !== page) continue
    const at = workspace.activatedAt[tab.id] ?? 0
    if (latest === undefined || at > latest.at) latest = { pane: tab.pane, at }
  }
  return Math.min(latest?.pane ?? 0, paneCount - 1)
}
