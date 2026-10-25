import { useEffect, useRef } from 'react'
import { useCurrentPane } from '../state/currentPane'
import { useFind } from '../state/find'
import { useSearchFocus } from '../state/searchFocus'
import { activeTab, tabsForPane } from '../state/tabs.logic'
import { useWorkspace } from '../state/tabs.store'
import { paneInDirection, type Direction } from './paneGrid'
import { actionOfKey, leftToField } from './shortcuts/keymap'
import { GUIDES_PAGE, HOME_PAGE_ID, SIDEBAR_PAGES } from './pages'
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
 * - Ctrl+Up/Down: Home and the sidebar's sections, in the order drawn.
 * - Ctrl+Left/Right: the tabs in the current window.
 * - Ctrl+Shift+arrows: the window that way, as the layout draws them.
 * - Alt+Left/Right: the current tab, one place along its window.
 * - Alt+Shift+arrows: the current tab, into the window that way.
 * - Ctrl+T, Ctrl+W, Ctrl+Shift+T: a new tab, closing one, the last closed back.
 * - Ctrl+F: find in the open windows. Ctrl+K: the search bar.
 *
 * Windows had Ctrl+Left/Right once, which left Ctrl+Down meaning the next
 * section in a layout whose windows were stacked (Karan). Plain Shift+arrows
 * stay free for extending a selection, as they do everywhere.
 *
 * The keys are Settings' (BU-291): each press is looked up as the action
 * whose shortcut it now is, so the list above is the defaults.
 *
 * A shortcut a field would use itself is not taken while typing: in a field,
 * Ctrl and Shift with the arrows move the caret and select text, and keys
 * without Ctrl type. Ctrl+T, Ctrl+W, Ctrl+F and Ctrl+K are, as in a browser,
 * since they edit nothing. Nothing is taken over a dialog or an open menu,
 * which own the keyboard while up.
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

      // Ctrl+F4 closes a tab as Ctrl+W does, as in a browser.
      if (event.ctrlKey && !event.altKey && event.key === 'F4') {
        closeTabHere(at)
        return
      }
      const action = actionOfKey(event)
      const run = action === undefined ? undefined : ACTIONS[action]
      if (run === undefined) return
      if (leftToField(event)) return
      // The key is the action's, whether or not it had anything to act on.
      event.preventDefault()
      run(at, go)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}

type Run = (page: string, goTo: (page: string) => void) => void

/** What each action does, by its id in the shortcut catalogue. */
const ACTIONS: Record<string, Run | undefined> = {
  'section-up': (page, goTo) => nextSection(page, -1, goTo),
  'section-down': (page, goTo) => nextSection(page, 1, goTo),
  'tab-previous': (page) => nextTab(page, -1),
  'tab-next': (page) => nextTab(page, 1),
  'window-left': (page) => windowTowards(page, 'left'),
  'window-right': (page) => windowTowards(page, 'right'),
  'window-up': (page) => windowTowards(page, 'up'),
  'window-down': (page) => windowTowards(page, 'down'),
  'tab-new': (page) => newTabHere(page),
  'tab-close': (page) => closeTabHere(page),
  'tab-reopen': () => reopenLastTab(),
  'tab-move-left': (page) => shiftTab(page, -1),
  'tab-move-right': (page) => shiftTab(page, 1),
  'tab-carry-left': (page) => carryTab(page, 'left'),
  'tab-carry-right': (page) => carryTab(page, 'right'),
  'tab-carry-up': (page) => carryTab(page, 'up'),
  'tab-carry-down': (page) => carryTab(page, 'down'),
  // Ctrl+F finds in the windows (BU-283); Ctrl+K goes to the search bar (BU-284).
  find: () => {
    useFind.getState().show()
  },
  search: () => {
    useSearchFocus.getState().ask()
  },
  // Only when given a key of their own: by default they are search's, then Alt.
  seek: () => {
    useSearchFocus.getState().ask('once')
  },
  'seek-held': () => {
    useSearchFocus.getState().ask('held')
  }
}

/**
 * Ctrl+W or Ctrl+F4, whatever they now do: Electron's default menu closes
 * the whole window on them, which is never wanted. Alt+F4 is Windows' own.
 */
function closesWindow(event: KeyboardEvent): boolean {
  return event.ctrlKey && !event.altKey && (event.code === 'KeyW' || event.key === 'F4')
}

/**
 * One section up or down, wrapping. Home is the first, as its mark is at the
 * sidebar's top, and Guides the last, at its foot (Karan): the order drawn.
 */
function nextSection(page: string, by: 1 | -1, goTo: (page: string) => void): boolean {
  const sections = [
    HOME_PAGE_ID,
    ...[...SIDEBAR_PAGES, GUIDES_PAGE]
      .filter((entry) => pageShips(entry.id))
      .map((entry) => entry.id)
  ]
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

function somethingOpen(): boolean {
  return document.querySelector('[aria-modal="true"], [role="menu"]') !== null
}
