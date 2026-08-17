import type { ViewOption } from '../viewRegistry'

/**
 * "backtest TECH10" and "TECH10 backtest" both mean the same thing (BU-79).
 *
 * A command palette is only as good as the sentences it accepts, and nobody
 * remembers which order an app wants. Both are parsed; when neither half
 * names a view the query degrades to the plain groups rather than erroring,
 * because "AAPL" on its own is a perfectly good thing to have typed.
 *
 * Deliberately not fuzzy. A view matches on a word-prefix of its title, which
 * is what makes "front" find Frontier and "data cov" find Data Coverage
 * without "ta" finding half the app.
 */
export interface Intent {
  view: ViewOption
  /** The other half of the query, verbatim — case is the user's business. */
  subject: string
}

/** Title words, lowercased. "Data Coverage" → ["data", "coverage"]. */
function words(title: string): string[] {
  return title.toLowerCase().split(/\s+/).filter(Boolean)
}

/**
 * Does `fragment` name this view?
 *
 * Every word of the fragment has to prefix a DISTINCT word of the title, in
 * order — so "data cov" matches "Data Coverage" and "cov data" does not.
 * Requiring order is what stops a two-word subject accidentally naming a view
 * whose words it happens to contain.
 */
export function namesView(fragment: string, view: ViewOption): boolean {
  const wanted = words(fragment)
  if (wanted.length === 0) return false

  const title = words(view.title)
  let at = 0
  for (const part of wanted) {
    const found = title.findIndex((word, index) => index >= at && word.startsWith(part))
    if (found === -1) return false
    at = found + 1
  }
  return true
}

/**
 * Split a query into a view and a subject, either order.
 *
 * Every split point is tried and the LONGEST view match wins, so "index
 * definition TECH10" resolves the two-word view rather than stopping at
 * "index". A query that is entirely a view name yields an intent with an
 * empty subject — "frontier" means open Frontier, with nothing pinned.
 */
export function parseIntent(query: string, views: readonly ViewOption[]): Intent | undefined {
  const parts = query.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return undefined

  let best: { intent: Intent; length: number } | undefined

  // `take` words as the view name, from the front and from the back.
  for (let take = parts.length; take >= 1; take -= 1) {
    const front = parts.slice(0, take).join(' ')
    const back = parts.slice(parts.length - take).join(' ')

    for (const view of views) {
      if (best !== undefined && take <= best.length) break

      if (namesView(front, view)) {
        best = { intent: { view, subject: parts.slice(take).join(' ') }, length: take }
        break
      }
      if (namesView(back, view)) {
        best = {
          intent: { view, subject: parts.slice(0, parts.length - take).join(' ') },
          length: take
        }
        break
      }
    }
  }

  return best?.intent
}
