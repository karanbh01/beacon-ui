import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { keys } from '../../api/keys'
import { useBeacon } from '../../api/queryClient'
import type { Suggestion } from '../../components/TickerField/suggestions'

/**
 * Identifier search against the engine (BN-127, BU-72).
 *
 * Replaces the universe-union index BU-68 shipped, which was partial in a way
 * the user could not see and empty on an engine with no universes configured.
 */

/**
 * Long enough that a fast typist does not fire one request per character,
 * short enough that the list never feels like it is catching up. Measured
 * against a keystroke cadence of ~120ms.
 */
const DEBOUNCE_MS = 120

/** Rows to ask for. The panel shows at most eight; the rest are headroom. */
const SEARCH_LIMIT = 12

export function useDebounced<T>(value: T, delay = DEBOUNCE_MS): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value)
    }, delay)
    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return settled
}

export interface IdentifierSearch {
  /** In the SERVER's rank order — see the client method's note. */
  suggestions: readonly Suggestion[]
  /** Total before `limit`, so a caller can say "showing 8 of 340". */
  total: number
}

const EMPTY: IdentifierSearch = { suggestions: [], total: 0 }

/**
 * `datasets` names what actually covers an identifier, so a caller that needs
 * prices can mark a reference-only row rather than offering it identically
 * and failing when it is picked.
 */
export function useIdentifierSearch(query: string): IdentifierSearch {
  const client = useBeacon()
  const settled = useDebounced(query.trim())

  const result = useQuery({
    queryKey: keys.data.identifiers(settled, { limit: SEARCH_LIMIT }),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.data.identifiers({ q: settled, limit: SEARCH_LIMIT }, signal)
    },
    enabled: client !== null && settled !== '',
    // Hold the last list while the next one is in flight. Without this the
    // panel empties between keystrokes and reads as "no matches" for a frame.
    placeholderData: keepPreviousData,
    // A typo produces a miss that is worth nothing to keep; a real fragment's
    // results do not go stale inside a session.
    staleTime: 5 * 60_000
  })

  if (settled === '' || result.data === undefined) return EMPTY

  return {
    // `identifiers` is defaulted server-side, so the schema makes it optional
    // even though a 200 always carries it.
    suggestions: (result.data.identifiers ?? []).map((row) => ({
      identifier: row.identifier,
      ...(row.name === null || row.name === undefined ? {} : { name: row.name }),
      ...(row.datasets === undefined ? {} : { datasets: row.datasets })
    })),
    total: result.data.total
  }
}
