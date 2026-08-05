import type { Suggestion } from '../../components/TickerField/suggestions'
import type { Tab } from '../../state/tabs.types'

export interface SearchRow {
  id: string
  group: string
  label: string
  meta: string
  /**
   * `tab` selects an open tab, `identifier` opens one on that subject, and
   * `action` is a command keyed to the query.
   */
  kind: 'tab' | 'identifier' | 'action'
  /** Set on an `identifier` row: the symbol to open. */
  subject?: string
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

/**
 * Rows for the search dropdown (Figma 147:13).
 *
 * The frame groups results under INDICES and ASSETS. ASSETS is real since
 * BN-127 gave py-beacon a search endpoint — before that there was nothing to
 * enumerate, and the group was left out rather than drawn empty (#40, #71).
 * INDICES still has no catalogue behind it.
 *
 * Identifiers come in ALREADY RANKED by the engine and are inserted in that
 * order. Open tabs go first regardless: something the user has in front of
 * them beats something they might want to open.
 */
export function searchRows(
  query: string,
  tabs: readonly Tab[],
  identifiers: readonly Suggestion[] = []
): SearchRow[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return []

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

  rows.push({
    id: 'action:create-index',
    group: 'ACTIONS',
    label: `Create index “${query.trim()}”`,
    meta: '↵',
    kind: 'action'
  })

  return rows
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
