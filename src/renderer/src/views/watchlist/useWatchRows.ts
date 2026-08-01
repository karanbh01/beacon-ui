import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { keys } from '../../api/keys'
import { useBeacon } from '../../api/queryClient'
import { buildRow, type WatchRow } from './watchlist'

/** Enough history for the YTD comparison and the 3M spark, with slack. */
function oneYearAgo(now: Date): string {
  const start = new Date(now)
  start.setFullYear(start.getFullYear() - 1)
  start.setMonth(start.getMonth() - 1)
  return start.toISOString().slice(0, 10)
}

/**
 * One prices call and one reference call per symbol.
 *
 * Two requests per row is the honest cost: py-beacon has no batch endpoint,
 * and the alternative — fetching only prices — would leave Name and Mkt Cap
 * permanently blank. They go through the same query keys the Prices and
 * Reference Data views use, so opening a symbol from here is already warm and
 * a freshness event invalidates all of it at once.
 */
export function useWatchRows(identifiers: readonly string[]): {
  rows: WatchRow[]
  loading: boolean
  error: unknown
} {
  const client = useBeacon()
  const start = useMemo(() => oneYearAgo(new Date()), [])
  const query = useMemo(() => ({ start }), [start])

  const prices = useQueries({
    queries: identifiers.map((identifier) => ({
      queryKey: keys.data.prices(identifier, query),
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        if (client === null) throw new Error('No engine')
        return client.data.prices(identifier, query, signal)
      },
      enabled: client !== null
    }))
  })

  const references = useQueries({
    queries: identifiers.map((identifier) => ({
      queryKey: keys.data.reference(identifier),
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        if (client === null) throw new Error('No engine')
        return client.data.reference(identifier, signal)
      },
      enabled: client !== null,
      // A name is decoration next to a price. Its absence must not make the
      // row look broken, and it must not cost three round trips to find out.
      retry: false
    }))
  })

  const rows = identifiers.map((identifier, index) =>
    buildRow({
      ticker: identifier,
      prices: prices[index]?.data?.prices,
      reference: references[index]?.data?.fields,
      pending: prices[index]?.isPending ?? true
    })
  )

  return {
    rows,
    loading: prices.some((result) => result.isPending),
    // The first real failure, so a whole watchlist does not go blank because
    // one symbol is unknown — but a dead engine still says so.
    error: prices.find((result) => result.isError)?.error
  }
}
