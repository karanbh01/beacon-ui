import type { Tab } from '../../state/tabs.types'

export interface SearchRow {
  id: string
  group: string
  label: string
  meta: string
  /** `tab` selects an open tab; `action` is a command keyed to the query. */
  kind: 'tab' | 'action'
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

/**
 * Rows for the search dropdown (Figma 147:13).
 *
 * The frame groups results under INDICES and ASSETS. Neither can be
 * populated: there is no index catalogue and no asset universe to search
 * until a spawned server can acquire a data source (#40). Rather than draw
 * two empty headings, this searches what genuinely exists — the open
 * workspace — and keeps the ACTIONS group, which needs nothing from the
 * engine. The shape is the frame's; the content is what is true.
 */
export function searchRows(query: string, tabs: readonly Tab[]): SearchRow[] {
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
