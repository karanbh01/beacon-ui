import { useEffect, useRef } from 'react'
import { useCurrentPane } from '../state/currentPane'
import { activeTab, tabsForPane } from '../state/tabs.logic'
import { useWorkspace } from '../state/tabs.store'
import { paneInDirection, type Direction } from './paneGrid'
import { SIDEBAR_PAGES } from './pages'
import { pageShips } from './release'
import {
  carryTab,
  closeTabHere,
  here,
  newTabHere,
  pagePanes,
  reopenLastTab,
  shiftTab
} from './tabActions'

/**
 * Moving around without the mouse (BU-276 to BU-281, Karan). Each modifier
 * has one job: Ctrl moves where you are, Alt carries the tab you are on, and
 * Shift with either takes the bigger step, from tabs to windows.
 *
 * - Ctrl+Up/Down: the sidebar's sections, Strategy Builder up to Optimiser.
 * - Ctrl+Left/Right: the tabs in the current window.
 * - Ctrl+Shift+arrows: the window that way, as the layout draws them.
 * - Alt+Left/Right: the current tab, one place along its window.
 * - Alt+Shift+arrows: the current tab, into the window that way.
 * - Ctrl+T, Ctrl+W, Ctrl+Shift+T: a new tab, closing one, the last closed back.
 *
 * Windows had Ctrl+Left/Right once, which left Ctrl+Down meaning the next
 * section in a layout whose windows were stacked (Karan). Plain Shift+arrows
 * stay free for extending a selection, as they do everywhere.
 *
 * The arrows are not taken while typing: in a field, Ctrl and Shift with them
 * move the caret and select text, and that is what they should go on doing.
 * Ctrl+T and Ctrl+W are, as in a browser, since they edit nothing. Nothing is
 * taken over a dialog or an open menu, which own the keyboard while up.
 */
export function useNavigationKeys(page: string, goTo: (page: string) => void): void {
  const latest = useRef({ page, goTo })
  latest.current = { page, goTo }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.metaKey) return
      const { page: at, goTo: go } = latest.current

      // Electron's default menu closes the whole window on Ctrl+W. Never
      // wanted here, so it is taken even when nothing can use it.
      if (closesWindow(event)) event.preventDefault()
      if (somethingOpen()) return

      if (tabKey(event, at)) {
        event.preventDefault()
        return
      }

      const direction = DIRECTIONS[event.key]
      if (direction === undefined || typing(event.target)) return
      if (arrowKey(event, direction, at, go)) event.preventDefault()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}

const DIRECTIONS: Record<string, Direction | undefined> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right'
}

/** Ctrl+W or Ctrl+F4. Alt+F4 is Windows' own, and left to it. */
function closesWindow(event: KeyboardEvent): boolean {
  return event.ctrlKey && !event.altKey && (event.code === 'KeyW' || event.key === 'F4')
}

/** Ctrl+T, Ctrl+W (or Ctrl+F4) and Ctrl+Shift+T: whether one was used. */
function tabKey(event: KeyboardEvent, page: string): boolean {
  if (!event.ctrlKey || event.altKey) return false
  if (event.code === 'KeyT') return event.shiftKey ? reopenLastTab() : newTabHere(page)
  if (event.shiftKey) return false
  if (event.code === 'KeyW' || event.key === 'F4') return closeTabHere(page)
  return false
}

/** The arrows with Ctrl or Alt, Shift taking the bigger step: whether one was used. */
function arrowKey(
  event: KeyboardEvent,
  direction: Direction,
  page: string,
  goTo: (page: string) => void
): boolean {
  const by = direction === 'up' || direction === 'left' ? -1 : 1
  const across = direction === 'left' || direction === 'right'

  if (event.altKey && !event.ctrlKey) {
    if (event.shiftKey) return carryTab(page, direction)
    return across && shiftTab(page, by)
  }
  if (!event.ctrlKey) return false
  if (event.shiftKey) return windowTowards(page, direction)
  return across ? nextTab(page, by) : nextSection(page, by, goTo)
}

/** One section up or down the sidebar, wrapping; from Home, to the first or last. */
function nextSection(page: string, by: 1 | -1, goTo: (page: string) => void): boolean {
  const sections = SIDEBAR_PAGES.filter((entry) => pageShips(entry.id)).map((entry) => entry.id)
  if (sections.length === 0) return false
  const at = sections.indexOf(page)
  const next = at === -1 ? (by === 1 ? 0 : sections.length - 1) : wrap(at + by, sections.length)
  const target = sections[next]
  if (target === undefined) return false
  goTo(target)
  return true
}

/** The window that way, marked with a pulse so the eye follows it. */
function windowTowards(page: string, direction: Direction): boolean {
  const at = here(page)
  if (at === undefined || at.count < 2) return false
  const to = paneInDirection(pagePanes(page), at.pane, direction)
  // At the edge it stays put, and still says it took the key: Ctrl+Shift+
  // arrows mean nothing else outside a field.
  if (to !== undefined) useCurrentPane.getState().choose(page, to, true)
  return true
}

/** The next tab in the current window, wrapping at either end. */
function nextTab(page: string, by: 1 | -1): boolean {
  const at = here(page)
  if (at === undefined) return false
  const workspace = useWorkspace.getState()
  const tabs = tabsForPane(workspace, page, at.pane, at.count)
  if (tabs.length < 2) return false
  const from = tabs.findIndex((tab) => tab.id === activeTab(workspace, page, at.pane, at.count)?.id)
  const target = tabs[wrap(from + by, tabs.length)]
  if (target === undefined) return false
  workspace.selectTab(target.id, at.pane)
  return true
}

function wrap(index: number, length: number): number {
  return ((index % length) + length) % length
}

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

function somethingOpen(): boolean {
  return document.querySelector('[aria-modal="true"], [role="menu"]') !== null
}
