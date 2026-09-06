import { isDocumentId } from '../api/ids'
import { newTabId } from '../state/tabs.logic'
import type { Tab } from '../state/tabs.types'
import type { ViewOption } from './viewRegistry'

export interface NewTabOption extends ViewOption {
  /**
   * Why it cannot be opened right now, or undefined when it can.
   *
   * Shown rather than hidden: a menu whose contents change as you open things
   * is harder to learn than one whose entries stay put and explain
   * themselves.
   */
  unavailable?: string
}

/**
 * The document a pinned tab would hang off, or undefined.
 *
 * A document tab has to NAME one (BU-163). Its identity is its document
 * (taxonomy §1), but a tab opened from this menu is titled "Index
 * Definition" and shows the catalogue — what it is looking at is the pane's
 * own state until an index is chosen. Pinning a backtest to that title would
 * run one against an index called "Index Definition".
 */
export function pinnableDocument(open: readonly Tab[]): string | undefined {
  for (const tab of open) {
    if (tab.archetype !== 'document') continue
    const named = tab.subject ?? (isDocumentId(tab.title) ? tab.title : undefined)
    if (named !== undefined) return named
  }
  return undefined
}

/**
 * Which of a page's views can be opened, given what is open in the WORKSPACE.
 *
 * Taxonomy §1 is the whole of the rule. A `linked` tab stores no subject and
 * resolves one from another tab; a `pinned` tab hangs off a document. Neither
 * can exist with nothing to attach to — opening one anyway would create a tab
 * that can never resolve a subject, which is the exact failure the archetypes
 * exist to prevent.
 *
 * The SCOPE is the workspace, not the page (BU-163). Anchors live on other
 * pages by design: the only document view in the app is Index Definition on
 * Strategy Builder, and every query view is on Data Explorer, while Beacon
 * View is five pinned views and a linked one. Judged per page, that whole
 * page's menu was disabled forever and could only be populated through the
 * palette. The tab link menu has always crossed pages, so this was the odd
 * one out rather than a rule anybody had chosen.
 *
 * `query`, `document` and `global` need nothing. A query view opens with no
 * subject and waits for a ticker, which is the point of BU-59.
 */
export function newTabOptions(views: readonly ViewOption[], open: readonly Tab[]): NewTabOption[] {
  // A linked tab follows another tab's subject, so its source must be one
  // that HAS a subject of its own — following a follower is not a chain the
  // model supports.
  const hasSubjectSource = open.some((tab) => tab.archetype === 'query')
  const document = pinnableDocument(open)

  return views.map((view) => {
    if (view.archetype === 'linked' && !hasSubjectSource) {
      return { ...view, unavailable: 'needs a query tab to follow' }
    }
    if (view.archetype === 'pinned' && document === undefined) {
      // Where to get one, not just that there is none: the view that makes
      // documents is on another page, which is the whole reason this row is
      // ever disabled.
      return { ...view, unavailable: 'needs an index — open one in Strategy Builder' }
    }
    return view
  })
}

/**
 * The tab a chosen option opens.
 *
 * A linked tab gets its source; a pinned one gets its document. Both are
 * resolved here rather than by the caller, so the archetype's invariant is
 * decided in the same place it was checked.
 */
export function tabForOption(
  option: ViewOption,
  page: string,
  open: readonly Tab[]
): { id: string; page: string; viewKind: string; archetype: Tab['archetype']; title: string } & {
  linkSourceId?: string
  pinnedDoc?: string
} {
  const base = {
    id: newTabId(option.viewKind, open),
    page,
    viewKind: option.viewKind,
    archetype: option.archetype,
    title: option.title
  }

  // This page's tabs first: a link to something visible beside you is easier
  // to read than one to a tab on a page you are not looking at (BU-163).
  const nearest = [...open].sort((a, b) => Number(b.page === page) - Number(a.page === page))

  if (option.archetype === 'linked') {
    const source = nearest.find((tab) => tab.archetype === 'query')
    return source === undefined ? base : { ...base, linkSourceId: source.id }
  }

  if (option.archetype === 'pinned') {
    const document = pinnableDocument(nearest)
    return document === undefined ? base : { ...base, pinnedDoc: document }
  }

  return base
}
