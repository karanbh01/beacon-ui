import { LAYOUT_OPTIONS } from '../../state/chrome'
import { MENUS } from '../pages'

/**
 * What the nine menu-bar menus contain (BU-76).
 *
 * A table rather than nine hand-built panels: the shape is identical and the
 * only thing that differs is the words. It also makes "how much of this menu
 * bar actually works" a countable question — `enabled` is the answer, and
 * most of it is `false`.
 *
 * Placeholders are RENDERED, disabled, rather than omitted. A File menu with
 * one live item reads as a broken File menu; a File menu whose items are
 * visibly not yet wired reads as an app under construction, which is true.
 */
export type MenuAction =
  | 'theme-light'
  | 'theme-dark'
  | 'theme-system'
  | `layout-${string}`
  | 'layout-reset'
  | 'preset-save'
  | `preset-apply-${string}`
  | 'none'

export interface MenuItem {
  label: string
  /** Keyboard hint, right-aligned. Display only — nothing binds these yet. */
  hint?: string
  /** What activating it does. `none` is a placeholder. */
  action: MenuAction
  /** Rendered but inert when false. */
  enabled: boolean
  /** Shown with a tick when true. Only meaningful for live items. */
  checked?: boolean
  separatorBefore?: boolean
  /**
   * Items in a flyout, opened by hovering this one (BU-121).
   *
   * An item with a submenu does nothing itself: its `action` is never
   * dispatched, because activating it means opening the flyout.
   */
  submenu?: readonly MenuItem[]
}

export interface Menu {
  label: string
  items: readonly MenuItem[]
}

/** A placeholder: present so the menu is not a lie, inert so it is not one either. */
function soon(label: string, hint?: string): MenuItem {
  return { label, action: 'none', enabled: false, ...(hint === undefined ? {} : { hint }) }
}

export interface MenuContext {
  /** The theme preference, so View can tick the active one. */
  theme: 'light' | 'dark' | 'system'
  /** The current page's layout, so View can tick it. */
  layout: string
  /**
   * Whether the page being shown has panes at all (BU-135).
   *
   * Home is a page of its own rather than a pane host, so a layout there is
   * written and never drawn, Reset window has nothing to reset, and a preset
   * would save an arrangement that does not exist. Disabled rather than
   * hidden, which is this menu bar's convention for anything that cannot act.
   */
  arrangeable?: boolean
}

/**
 * The menus, built against the current state so live items can show a tick.
 *
 * View is the only menu with anything live in it, because the theme toggle
 * and the layout options are the two things that already exist and already
 * have somewhere to write to.
 */
export function buildMenus(context: MenuContext): Menu[] {
  const arrangeable = context.arrangeable ?? true
  const byLabel: Record<string, readonly MenuItem[]> = {
    File: [
      soon('New index…', 'Ctrl+N'),
      soon('Open…', 'Ctrl+O'),
      soon('Save', 'Ctrl+S'),
      { ...soon('Export…'), separatorBefore: true }
    ],
    Edit: [
      soon('Undo', 'Ctrl+Z'),
      soon('Redo', 'Ctrl+Y'),
      { ...soon('Cut', 'Ctrl+X'), separatorBefore: true },
      soon('Copy', 'Ctrl+C'),
      soon('Paste', 'Ctrl+V')
    ],
    View: [
      {
        label: 'Light theme',
        action: 'theme-light',
        enabled: true,
        checked: context.theme === 'light'
      },
      {
        label: 'Dark theme',
        action: 'theme-dark',
        enabled: true,
        checked: context.theme === 'dark'
      },
      {
        label: 'Match system',
        action: 'theme-system',
        enabled: true,
        checked: context.theme === 'system'
      },
      /*
       * Seven layouts under one item (BU-121).
       *
       * They are one choice, not seven, and listing them inline made a menu
       * that also carries the theme and preset saving read as a layout menu
       * with other things stuck to it. The flyout keeps the tick where the
       * choice is.
       */
      {
        label: 'Window layout',
        action: 'none',
        enabled: arrangeable,
        separatorBefore: true,
        submenu: LAYOUT_OPTIONS.map((option) => ({
          label: option.label,
          action: `layout-${option.id}` as MenuAction,
          enabled: arrangeable,
          checked: context.layout === option.id
        }))
      },
      {
        label: 'Reset window',
        action: 'layout-reset',
        enabled: arrangeable
      },
      /*
       * Saving only (BU-120).
       *
       * Applying moved to the layout dropdown, which is the control that
       * arranges the page — a saved arrangement belongs beside the six that
       * are not saved. Saving stays here because it is an action on the
       * layout this menu already owns.
       */
      {
        label: 'Save layout as preset…',
        action: 'preset-save',
        enabled: arrangeable,
        separatorBefore: true
      }
    ],
    Data: [soon('Refresh all'), soon('Manage sources…'), soon('Import CSV…')],
    Analysis: [soon('Run backtest…'), soon('Run optimisation…'), soon('Risk model…')],
    Asset: [soon('Add to watchlist'), soon('Corporate actions'), soon('Reference data')],
    Portfolio: [soon('New portfolio…'), soon('Rebalance…'), soon('Attribution…')],
    Settings: [soon('Preferences…'), soon('Data directory…'), soon('Keyboard shortcuts…')],
    Help: [soon('Documentation'), soon('Release notes'), soon('About Beacon')]
  }

  return MENUS.map((label) => ({ label, items: byLabel[label] ?? [] }))
}

/** Index of the next enabled item, wrapping. -1 when none can be reached. */
export function nextEnabled(items: readonly MenuItem[], from: number, step: 1 | -1): number {
  const total = items.length
  if (total === 0) return -1

  for (let hop = 1; hop <= total; hop += 1) {
    const at = (((from + step * hop) % total) + total) % total
    if (items[at]?.enabled === true) return at
  }
  return -1
}
