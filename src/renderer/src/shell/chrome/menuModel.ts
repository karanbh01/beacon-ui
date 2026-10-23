import type { EditCommand } from '@shared/ipc'
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
  | 'manage-sources'
  | 'generate-data'
  | 'refresh-data'
  | 'data-preferences'
  | 'holding-columns'
  | 'refresh-engine'
  | 'modelling-assumptions'
  | 'preset-picker'
  | 'tab-new'
  | 'tab-close'
  | 'tab-reopen'
  | `edit-${EditCommand}`
  | 'open-data-folder'
  | 'import-data'
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
  /**
   * Whether the store being served can be refreshed (BU-217). False with
   * nothing served, and for a store the engine has no refresh for — imported
   * files, or synthetic data older than py-beacon 0.1.2.
   */
  refreshable?: boolean
  /**
   * A release build, which leaves out the Optimiser (BU-209). Its two rows
   * here go with it rather than sitting inert for a page that is not there.
   */
  releaseBuild?: boolean
  /** Whether the engine has been started, so Refresh Engine has one to restart. */
  engineStarted?: boolean
  /**
   * What Edit's tab items can do on this page (BU-282): open one in the
   * current window, close the one showing there, bring back the last closed.
   */
  tabs?: { canOpen: boolean; canClose: boolean; canReopen: boolean }
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
    // Chromium's own commands on whatever had focus (BU-273). Always
    // enabled, as a native Edit menu's are: what can be undone or pasted is
    // the field's to know, not the menu's.
    Edit: [
      { label: 'Undo', hint: 'Ctrl+Z', action: 'edit-undo', enabled: true },
      { label: 'Redo', hint: 'Ctrl+Y', action: 'edit-redo', enabled: true },
      { label: 'Cut', hint: 'Ctrl+X', action: 'edit-cut', enabled: true, separatorBefore: true },
      { label: 'Copy', hint: 'Ctrl+C', action: 'edit-copy', enabled: true },
      { label: 'Paste', hint: 'Ctrl+V', action: 'edit-paste', enabled: true },
      // The tab shortcuts, where they can be found (BU-282), acting on the
      // current window as the keys do.
      {
        label: 'New tab',
        hint: 'Ctrl+T',
        action: 'tab-new',
        enabled: context.tabs?.canOpen ?? false,
        separatorBefore: true
      },
      {
        label: 'Close tab',
        hint: 'Ctrl+W',
        action: 'tab-close',
        enabled: context.tabs?.canClose ?? false
      },
      {
        label: 'Reopen closed tab',
        hint: 'Ctrl+Shift+T',
        action: 'tab-reopen',
        enabled: context.tabs?.canReopen ?? false
      }
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
      // The page's presets at a glance, centred (BU-275). Enabled on Home
      // too, where it says why there is nothing to choose.
      {
        label: 'Presets…',
        hint: 'Ctrl+Shift+P',
        action: 'preset-picker',
        enabled: true
      },
      {
        label: 'Reset window',
        hint: 'Ctrl+Shift+R',
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
    /*
     * Loading data and where it comes from — Karan's line for this menu, and
     * why modelling assumptions went to Analysis instead.
     *
     * Grouped so the shape says what the groups are (BU-146): everything at
     * once, then the imports, then where it all comes from. The document
     * imports are not wired yet, so they are rendered and visibly inert — the
     * convention this menu bar has kept since BU-76, because a menu that hides
     * what it cannot do reads as a menu that was never going to do it.
     *
     * One `Import files…` where there was a row per dataset (BU-215). The
     * engine takes every sheet in one import, so a row per dataset promised a
     * per-dataset import that does not exist. BU-146's reason for those rows —
     * that a dataset py-beacon adds should need no renderer change — holds for
     * the single entry too: the engine reads any sheet its template defines.
     *
     * Open and Import go through the sources dialog, because both can be
     * refused with detail — a folder that is not a store, an import's rows —
     * and a menu item has nowhere to put it. Generate acts at once, so no
     * ellipsis: its failures are a job's, which the tray already shows.
     */
    Data: [
      // The served store, from its own source (BU-217). "Refresh all" when
      // it was a sync per dataset; the engine refreshes the store whole.
      {
        label: 'Refresh data',
        action: 'refresh-data',
        enabled: context.refreshable ?? false
      },
      {
        label: 'Import files…',
        action: 'import-data',
        enabled: true,
        separatorBefore: true
      },
      soon('Import index definition'),
      soon('Import universe'),
      {
        label: 'Generate synthetic data',
        action: 'generate-data',
        enabled: true,
        separatorBefore: true
      },
      {
        label: 'Open a data folder…',
        action: 'open-data-folder',
        enabled: true
      },
      {
        label: 'Manage sources…',
        action: 'manage-sources',
        enabled: true
      },
      // How numbers read, rather than where they come from — set apart, as a
      // setting for the data rather than a way to get some (BU-228).
      {
        label: 'Data Preferences…',
        action: 'data-preferences',
        enabled: true,
        separatorBefore: true
      }
    ],
    Analysis: [
      /*
       * Restart py-beacon by hand (Karan, 0.2.2). The supervisor restarts
       * one that exits, and gives up after six tries in a row; one that
       * stops answering is left running, since it may only be busy. Either
       * way this is the way back.
       */
      {
        label: 'Refresh Engine',
        action: 'refresh-engine',
        enabled: context.engineStarted ?? false
      },
      // The defaults every new backtest starts from (BU-272).
      {
        label: 'Modelling assumptions…',
        action: 'modelling-assumptions',
        enabled: true,
        separatorBefore: true
      },
      { ...soon('Run backtest…'), separatorBefore: true },
      ...(context.releaseBuild === true ? [] : [soon('Run optimisation…'), soon('Risk model…')])
    ],
    Asset: [
      soon('Add to watchlist'),
      soon('Corporate actions'),
      soon('Reference data'),
      // Which reference columns sit beside a ticker in every holdings table
      // (Karan, 2026-10-19). A table can still choose its own.
      {
        label: 'Holding columns…',
        action: 'holding-columns',
        enabled: true,
        separatorBefore: true
      }
    ],
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
