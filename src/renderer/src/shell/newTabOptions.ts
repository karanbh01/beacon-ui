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
 * Which of a page's views can be opened, given what is already open.
 *
 * Taxonomy §1 is the whole of this. A `linked` tab stores no subject and
 * resolves one from another tab; a `pinned` tab hangs off a document. Neither
 * can exist with nothing to attach to — opening one anyway would create a tab
 * that can never resolve a subject, which is the exact failure the archetypes
 * exist to prevent.
 *
 * `query`, `document` and `global` need nothing. A query view opens with no
 * subject and waits for a ticker, which is the point of BU-59.
 */
export function newTabOptions(views: readonly ViewOption[], open: readonly Tab[]): NewTabOption[] {
  // A linked tab follows another tab's subject, so its source must be one
  // that HAS a subject of its own — following a follower is not a chain the
  // model supports.
  const hasSubjectSource = open.some((tab) => tab.archetype === 'query')
  const hasDocument = open.some((tab) => tab.archetype === 'document')

  return views.map((view) => {
    if (view.archetype === 'linked' && !hasSubjectSource) {
      return { ...view, unavailable: 'needs a query tab to follow' }
    }
    if (view.archetype === 'pinned' && !hasDocument) {
      return { ...view, unavailable: 'needs an open document' }
    }
    return view
  })
}

/** Ids are per-tab, and a page can hold several of the same kind. */
export function newTabId(viewKind: string, existing: readonly Tab[]): string {
  const taken = new Set(existing.map((tab) => tab.id))
  for (let n = 1; ; n++) {
    const id = n === 1 ? `tab-${viewKind}` : `tab-${viewKind}-${String(n)}`
    if (!taken.has(id)) return id
  }
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

  if (option.archetype === 'linked') {
    const source = open.find((tab) => tab.archetype === 'query')
    return source === undefined ? base : { ...base, linkSourceId: source.id }
  }

  if (option.archetype === 'pinned') {
    const document = open.find((tab) => tab.archetype === 'document')
    return document === undefined ? base : { ...base, pinnedDoc: document.title }
  }

  return base
}
