import { layoutFor, useChrome } from '../state/chrome'
import { currentPane, useCurrentPane } from '../state/currentPane'
import { activeTab, tabsForPane } from '../state/tabs.logic'
import { useWorkspace } from '../state/tabs.store'
import { paneInDirection, panesFor, type Direction } from './paneGrid'
import { SIDEBAR_PAGES } from './pages'

/**
 * What the keyboard does to tabs (BU-280, BU-281): open one, close one, bring
 * one back, and carry one along its window or into another. Each acts on the
 * current window's tab, and says whether it did anything, so a key it could
 * not use is left to whoever else wants it.
 */

/** Panes on a page that has them; Home and Guides have none. */
export function pagePanes(page: string): ReturnType<typeof panesFor> {
  if (!SIDEBAR_PAGES.some((entry) => entry.id === page)) return []
  return panesFor(layoutFor(useChrome.getState().layoutByPage, page))
}

/** The page's current window, and how many it has; undefined on a page without panes. */
export function here(page: string): { pane: number; count: number } | undefined {
  const count = pagePanes(page).length
  if (count === 0) return undefined
  const pane = currentPane(
    useCurrentPane.getState().byPage[page],
    useWorkspace.getState(),
    page,
    count
  )
  return { pane, count }
}

/** Ctrl+T: the current window's + menu, opened and focused. */
export function newTabHere(page: string): boolean {
  const at = here(page)
  if (at === undefined) return false
  useCurrentPane.getState().askNewTab(page, at.pane)
  return true
}

/** Ctrl+W: the current window's tab, closed as its × would. */
export function closeTabHere(page: string): boolean {
  const at = here(page)
  if (at === undefined) return false
  const workspace = useWorkspace.getState()
  const tab = activeTab(workspace, page, at.pane, at.count)
  if (tab === undefined) return false
  workspace.closeTab(tab.id, at.pane, at.count)
  return true
}

/** Ctrl+Shift+T: the last tab closed, back where it was. */
export function reopenLastTab(): boolean {
  const workspace = useWorkspace.getState()
  if (workspace.closed.length === 0) return false
  workspace.reopenTab()
  return true
}

/** Alt+Left/Right: the current tab one place along its window, stopping at the ends. */
export function shiftTab(page: string, by: 1 | -1): boolean {
  const at = here(page)
  if (at === undefined) return false
  const workspace = useWorkspace.getState()
  const tabs = tabsForPane(workspace, page, at.pane, at.count)
  const tab = activeTab(workspace, page, at.pane, at.count)
  if (tab === undefined) return false
  const from = tabs.findIndex((candidate) => candidate.id === tab.id)
  const to = from + by
  if (to < 0 || to >= tabs.length) return true
  // `index` counts the destination's tabs without the one moving, so a step
  // right lands one past where it stood.
  workspace.moveTab(tab.id, at.pane, to, at.count)
  return true
}

/** Alt+Shift+arrows: the current tab carried to the window that way, and the eye with it. */
export function carryTab(page: string, direction: Direction): boolean {
  const at = here(page)
  if (at === undefined || at.count < 2) return false
  const workspace = useWorkspace.getState()
  const tab = activeTab(workspace, page, at.pane, at.count)
  if (tab === undefined) return true
  const to = paneInDirection(pagePanes(page), at.pane, direction)
  if (to === undefined) return true
  const arriving = tabsForPane(workspace, page, to, at.count).length
  workspace.moveTab(tab.id, to, arriving, at.count)
  useCurrentPane.getState().choose(page, to, true)
  return true
}
