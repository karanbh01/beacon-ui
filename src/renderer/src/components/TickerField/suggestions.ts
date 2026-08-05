/**
 * Matching a typed fragment against the identifiers the app knows about
 * (BU-68).
 *
 * Client-side, because py-beacon has no symbol search and no way to enumerate
 * what it covers — see #71. The index is whatever the app could reach, so this
 * is deliberately forgiving about what it matches and strict about the order
 * it offers things in.
 */

export interface Suggestion {
  identifier: string
  /** Long name, when reference data had one. */
  name?: string
}

/** Rows offered at once. More than this and the panel becomes a page. */
export const MAX_SUGGESTIONS = 8

/**
 * Lower is better.
 *
 * A ticker prefix beats a name substring, always: someone typing `CMP0` wants
 * CMP000, not the first company whose description happens to contain "cmp0".
 */
function rank(query: string, suggestion: Suggestion): number {
  const identifier = suggestion.identifier.toLowerCase()
  const name = suggestion.name?.toLowerCase() ?? ''

  if (identifier === query) return 0
  if (identifier.startsWith(query)) return 1
  if (name.startsWith(query)) return 2
  if (identifier.includes(query)) return 3
  if (name.includes(query)) return 4
  return Number.POSITIVE_INFINITY
}

export function matchSuggestions(
  query: string,
  index: readonly Suggestion[],
  limit = MAX_SUGGESTIONS
): Suggestion[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return []

  return index
    .map((suggestion) => ({ suggestion, score: rank(needle, suggestion) }))
    .filter((row) => Number.isFinite(row.score))
    .sort(
      (a, b) => a.score - b.score || a.suggestion.identifier.localeCompare(b.suggestion.identifier)
    )
    .slice(0, limit)
    .map((row) => row.suggestion)
}

/**
 * Fold several sources into one index, first mention winning.
 *
 * Order matters because the earlier sources carry names: a bare identifier
 * from an open tab must not shadow the same identifier from reference data,
 * which knows what the company is called.
 */
export function mergeIndex(...sources: readonly (readonly Suggestion[])[]): Suggestion[] {
  const seen = new Map<string, Suggestion>()
  for (const source of sources) {
    for (const suggestion of source) {
      const existing = seen.get(suggestion.identifier)
      if (existing === undefined) seen.set(suggestion.identifier, suggestion)
      else if (existing.name === undefined && suggestion.name !== undefined) {
        seen.set(suggestion.identifier, suggestion)
      }
    }
  }
  return [...seen.values()]
}
