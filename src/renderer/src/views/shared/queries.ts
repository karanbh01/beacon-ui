import { useMemo } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { keys } from '../../api/keys'
import { useBeacon } from '../../api/queryClient'

/**
 * Queries shared by more than one Data Explorer view.
 *
 * Reference data is the header caption in Prices and the entire subject in
 * Reference Data, so it lives here rather than inside either view — two
 * copies would eventually drift on the query key and silently stop sharing
 * the cache.
 */

export interface ReferenceOptions {
  /**
   * Set by Prices, which shows reference data as a header caption and treats
   * its absence as cosmetic — a missing one must not stop prices rendering.
   * The Reference Data view omits it and inherits the app-wide retry policy,
   * because there the reference IS the pane.
   */
  noRetry?: boolean
}

export function useReference(identifier: string, options: ReferenceOptions = {}) {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.data.reference(identifier),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.data.reference(identifier, signal)
    },
    // No client means no engine — BU-19 is still starting or the server died.
    enabled: client !== null && identifier !== '',
    ...(options.noRetry === true ? { retry: false } : {})
  })
}

/**
 * The one field a table has to ASK for. Everything else arrives anyway.
 *
 * This used to name columns — `name`, `gics_sector`, `market_cap` and so on —
 * and every one of them was wrong. Reference columns are UPPERCASE and
 * case-sensitive, an unknown one is a hard 422 rather than a null, and
 * `market_cap` is not a column on any dataset py-beacon ships. So the whole
 * batch was rejected and every detail column in the universe table was empty
 * against a real engine. The stub hid it by fabricating whatever was asked
 * for.
 *
 * Naming ONLY the derived field is both the fix and the more robust request:
 * omitting the stored columns returns all of them, whatever a given dataset
 * happens to carry, so no column name is hard-coded in the client at all.
 * Verified against a running engine.
 */
export const TABLE_REFERENCE_FIELDS = ['adv_3m'] as const

/** py-beacon caps a batch at 1000 identifiers per call. */
export const REFERENCE_BATCH_LIMIT = 1000

/**
 * Reference for a whole list in one request (BN-—, #45).
 *
 * Replaces a `useQueries` fan-out of one call per name, which is what forced
 * the universe table to fill only its first 60 rows.
 */
export function useReferenceBatch(
  identifiers: readonly string[],
  fields: readonly string[] = TABLE_REFERENCE_FIELDS,
  /**
   * Point-in-time (BU-92). Empty means today. The engine returns only rows
   * valid on this date, marking the rest `found: false` — the definition of
   * "valid then" is py-beacon's, and reimplementing it here from DATE_FROM
   * and DATE_TO would be a second copy to keep in step.
   */
  date = ''
) {
  const client = useBeacon()
  const wanted = identifiers.slice(0, REFERENCE_BATCH_LIMIT)

  return useQuery({
    queryKey: keys.data.referenceBatch(wanted, fields, date),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.data.referenceBatch(wanted, fields, date, signal)
    },
    enabled: client !== null && wanted.length > 0
  })
}

/**
 * Reference for a list of ANY length (BU-94).
 *
 * The engine caps a call at 1,000 identifiers. `useReferenceBatch` handled
 * that by truncating, which was visible but harmless while the surplus rows
 * simply drew with dashes — and became a wrong ANSWER the moment BU-92 began
 * dropping rows the engine had not confirmed. A 5,000-name universe reported
 * 757 members as of a date where the true figure was 3,849: the same
 * proportion, measured on a fifth of the population.
 *
 * So the list is split into calls of the cap instead. Sorted as well as
 * deduplicated, because the chunk is its own query key and two renders asking
 * the same question should hit one cache entry.
 */
export interface ReferenceRows {
  /** identifier → its fields, absent when the engine had no valid row. */
  byIdentifier: ReadonlyMap<string, Record<string, unknown>>
  /** True until every chunk has answered; counts are not final before. */
  loading: boolean
}

export function useReferenceRows(
  identifiers: readonly string[],
  fields: readonly string[] = TABLE_REFERENCE_FIELDS,
  date = ''
): ReferenceRows {
  const client = useBeacon()

  const chunks = useMemo(() => {
    const unique = [...new Set(identifiers)].sort((a, b) => a.localeCompare(b))
    const out: string[][] = []
    for (let at = 0; at < unique.length; at += REFERENCE_BATCH_LIMIT) {
      out.push(unique.slice(at, at + REFERENCE_BATCH_LIMIT))
    }
    return out
  }, [identifiers])

  const results = useQueries({
    queries: chunks.map((ids) => ({
      queryKey: keys.data.referenceBatch(ids, fields, date),
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        if (client === null) throw new Error('No engine')
        return client.data.referenceBatch(ids, fields, date, signal)
      },
      enabled: client !== null
    }))
  })

  const byIdentifier = useMemo(() => {
    const rows = new Map<string, Record<string, unknown>>()
    for (const result of results) {
      for (const entry of result.data?.entries ?? []) {
        // `found: false` is the engine saying it has no valid row — under a
        // date that means "not listed then". Either way there is nothing to
        // record, and an entry mapped to undefined would be indistinguishable
        // from one that is present, which is BU-92's bug.
        if (entry.found && entry.fields != null) rows.set(entry.identifier, entry.fields)
      }
    }
    return rows
  }, [results])

  return {
    byIdentifier,
    loading: chunks.length > 0 && results.some((result) => result.isPending)
  }
}

export interface CorporateActionsOptions {
  start?: string | undefined
}

/**
 * The whole history in one call.
 *
 * The `types` query parameter is deliberately not used: the summary aggregates
 * py-beacon returns are computed over everything it sent, so filtering at the
 * server would leave a dividend total sitting above a table that excludes
 * dividends. The type filter is applied client-side instead.
 */
export function useCorporateActions(identifier: string, options: CorporateActionsOptions = {}) {
  const client = useBeacon()
  const query = options.start === undefined ? {} : { start: options.start }

  return useQuery({
    queryKey: keys.data.corporateActions(identifier, query),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.data.corporateActions(identifier, query, signal)
    },
    enabled: client !== null && identifier !== ''
  })
}

export function useCoverage() {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.data.coverage(),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.data.coverage(signal)
    },
    enabled: client !== null
  })
}

export function useWatchlists() {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.data.watchlists(),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.data.watchlists(signal)
    },
    enabled: client !== null
  })
}

/**
 * Start a sync and stop.
 *
 * The endpoint answers 202 with a job, so there is nothing to await: progress
 * arrives on the event feed and BU-21's job store renders it. Invalidating
 * coverage here would only refetch the numbers the sync has not changed yet —
 * the freshness event that follows the job is what makes them refresh, and it
 * already does that for every view at once.
 */
export function useSyncDataset() {
  const client = useBeacon()

  return useMutation({
    mutationFn: (dataset: string) => {
      if (client === null) throw new Error('No engine')
      return client.data.sync(dataset)
    }
  })
}

/**
 * Create, rename or re-order a watchlist.
 *
 * Watchlists are the one thing in Data Explorer the user owns, so the list
 * is refetched on success rather than optimistically patched: a PUT that the
 * engine rejected must not leave a symbol on screen that is not stored.
 */
export function useSaveWatchlist() {
  const client = useBeacon()
  const queries = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      name,
      identifiers
    }: {
      id: string
      name: string
      identifiers: string[]
    }) => {
      if (client === null) throw new Error('No engine')
      return client.data.putWatchlist(id, { name, identifiers })
    },
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: keys.data.watchlists() })
    }
  })
}
