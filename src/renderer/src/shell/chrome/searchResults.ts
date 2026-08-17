import type { Suggestion } from '../../components/TickerField/suggestions'
import type { Tab } from '../../state/tabs.types'
import type { ViewOption } from '../viewRegistry'
import { namesView, parseIntent } from './intent'

export interface SearchRow {
  id: string
  group: string
  label: string
  meta: string
  /**
   * `tab` selects an open tab, `identifier` opens one on that subject,
   * `view` opens a view (optionally pinned to a subject), `index` opens an
   * index, and `action` is a command keyed to the query.
   */
  kind: 'tab' | 'identifier' | 'view' | 'index' | 'action'
  /** The symbol, index id or subject this row opens with. */
  subject?: string
  /** Set on `view`: which view to open, and where it lives. */
  view?: ViewOption
}

/** Where a matched tab lives, so a row says more than its own title. */
function describe(tab: Tab): string {
  if (tab.subject !== undefined) return `${tab.page} · ${tab.subject}`
  if (tab.pinnedDoc !== undefined) return `${tab.page} · ${tab.pinnedDoc}`
  return tab.page
}

function matches(tab: Tab, needle: string): boolean {
  return (
    tab.title.toLowerCase().includes(needle) ||
    (tab.subject ?? '').toLowerCase().includes(needle) ||
    (tab.pinnedDoc ?? '').toLowerCase().includes(needle)
  )
}

/** Above this the panel stops being scannable and starts being a list. */
const MAX_TABS = 6

/** Identifiers get fewer rows than tabs: the query bar is where you browse. */
const MAX_IDENTIFIERS = 5

/** Enough to find one by name without turning the panel into a catalogue. */
const MAX_INDICES = 4
const MAX_VIEWS = 4

/** An index the engine knows about. */
export interface IndexRef {
  id: string
  name?: string
  /** Open with unsaved changes somewhere in the workspace. */
  dirty?: boolean
}

export interface SearchSources {
  identifiers?: readonly Suggestion[]
  indices?: readonly IndexRef[]
  views?: readonly ViewOption[]
}

/**
 * Rows for the empty query: what you were just doing (BU-79).
 *
 * A palette that shows nothing until you type wastes the most common case —
 * going back to the tab you had a minute ago. Ordered by activation rather
 * than by creation, which is what "recent" has to mean for it to be worth
 * offering.
 */
export function recentRows(recent: readonly Tab[]): SearchRow[] {
  return recent.slice(0, MAX_TABS).map((tab) => ({
    id: tab.id,
    group: 'RECENT',
    label: tab.title,
    meta: describe(tab),
    kind: 'tab'
  }))
}

/**
 * Rows for the search dropdown (Figma 147:13).
 *
 * The command palette (BU-79). Ordered tabs → intent → indices → assets →
 * views, which is roughly "what you have" before "what you asked for" before
 * "what exists".
 *
 * An INTENT row is the interesting one: "backtest TECH10" and "TECH10
 * backtest" both parse into a view plus a subject, and that row goes above
 * the plain groups because it is the most specific reading of what was typed.
 * When neither half names a view the query degrades to the plain groups
 * rather than erroring — see intent.ts.
 */
export function searchRows(
  query: string,
  tabs: readonly Tab[],
  sources: SearchSources = {}
): SearchRow[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return []

  const { identifiers = [], indices = [], views = [] } = sources

  const rows: SearchRow[] = tabs
    .filter((tab) => matches(tab, needle))
    .slice(0, MAX_TABS)
    .map((tab) => ({
      id: tab.id,
      group: 'OPEN TABS',
      label: tab.title,
      meta: describe(tab),
      kind: 'tab'
    }))

  // The most specific reading of the query, when there is one.
  const intent = parseIntent(query, views)
  if (intent !== undefined && intent.subject !== '') {
    rows.push({
      id: `intent:${intent.view.viewKind}:${intent.subject}`,
      group: 'OPEN',
      label: `${intent.view.title} · ${intent.subject}`,
      meta: intent.view.page,
      kind: 'view',
      subject: intent.subject,
      view: intent.view
    })
  }

  for (const index of indices.filter((entry) => nameMatches(entry, needle)).slice(0, MAX_INDICES)) {
    rows.push({
      id: `index:${index.id}`,
      group: 'INDICES',
      // The dirty dot is the tab strip's own mark for unsaved work, so an
      // index open with changes reads the same in both places.
      label: index.dirty === true ? `${index.id} •` : index.id,
      meta: index.name ?? '',
      kind: 'index',
      subject: index.id
    })
  }

  // Not one already open as a subject — the tab row above IS that, and the
  // same symbol twice under two headings reads as a bug.
  const open = new Set(tabs.map((tab) => tab.subject).filter((subject) => subject !== undefined))

  let offered = 0
  for (const suggestion of identifiers) {
    // Counted per identifier, not against the total: with no tabs matching,
    // a shared budget would let the whole limit through as assets and turn
    // the panel into a page.
    if (offered >= MAX_IDENTIFIERS) break
    if (open.has(suggestion.identifier)) continue
    offered += 1
    rows.push({
      id: `identifier:${suggestion.identifier}`,
      group: 'ASSETS',
      label: suggestion.identifier,
      meta: suggestion.name ?? '',
      kind: 'identifier',
      subject: suggestion.identifier
    })
  }

  // Subjectless views, by name. The intent row above already covers the case
  // where a subject was named, so this is "just open it".
  const named = views.filter((view) => namesView(query, view)).slice(0, MAX_VIEWS)
  for (const view of named) {
    rows.push({
      id: `view:${view.viewKind}`,
      group: 'VIEWS',
      label: view.title,
      meta: view.page,
      kind: 'view',
      view
    })
  }

  rows.push({
    id: 'action:create-index',
    group: 'ACTIONS',
    label: `Create index “${query.trim()}”`,
    meta: '↵',
    kind: 'action'
  })

  return rows
}

function nameMatches(index: IndexRef, needle: string): boolean {
  return (
    index.id.toLowerCase().includes(needle) || (index.name ?? '').toLowerCase().includes(needle)
  )
}

/** Rows in order, with the group heading each one falls under. */
export function groupRows(rows: readonly SearchRow[]): { group: string; rows: SearchRow[] }[] {
  const groups: { group: string; rows: SearchRow[] }[] = []
  for (const row of rows) {
    const last = groups.at(-1)
    if (last?.group === row.group) {
      last.rows.push(row)
      continue
    }
    groups.push({ group: row.group, rows: [row] })
  }
  return groups
}
