import { createContext, useContext } from 'react'
import type { Suggestion } from '../../components/TickerField/suggestions'

/**
 * Everything the app can name, for the query bar's typeahead (BU-68).
 *
 * **py-beacon has no symbol search and no way to list what it covers** —
 * `/data/coverage` reports 512 identifiers and will not name one of them, and
 * `/data/reference` needs the identifiers up front. Filed as #71. So this
 * indexes what the client can actually reach: the universes the engine
 * publishes, named from one reference batch, plus whatever is already open.
 *
 * That is bounded in a way the user cannot see — an identifier the store
 * covers but no universe contains will not be suggested. Typing it still
 * works, which is why Enter with nothing highlighted stays a plain submit.
 *
 * Lives in a context rather than a hook each view calls: it is one list for
 * the whole app, and the field reads it without five views having to pass it
 * down. Search itself is a query (`useIdentifierSearch`), so `TickerField`
 * does need a QueryClient — it degrades to this list alone when there is no
 * engine to ask.
 */

export const IdentifierIndexContext = createContext<readonly Suggestion[]>([])

export function useIdentifierIndex(): readonly Suggestion[] {
  return useContext(IdentifierIndexContext)
}
