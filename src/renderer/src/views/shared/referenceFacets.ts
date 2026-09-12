import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { keys } from '../../api/keys'
import { useBeacon } from '../../api/queryClient'
import { filtersFor, type FilterSpec } from '../universe/builder'

export interface ReferenceFacets {
  /** Every categorical or numeric column present, with its values or bounds. */
  specs: FilterSpec[]
  /** Each name's reference row, for grouping or labelling. */
  byIdentifier: ReadonlyMap<string, Record<string, unknown>>
  loading: boolean
}

/**
 * What the reference data actually holds for a set of names (BU-182).
 *
 * Every field, not the three a constituent table shows: `useReferenceRows`
 * defaults to the numeric columns, and both callers here want the
 * categorical ones. Which columns exist is the engine's answer rather than
 * ours, so the request names none and takes what comes back — the same
 * choice the universe builder made, which is why six new filters appeared
 * when BN-128 added three columns and no client changed.
 *
 * Used for two different questions off one request: which dimensions a
 * weights table can roll up by, and which values a screen can compare
 * against.
 */
export function useReferenceFacets(identifiers: readonly string[]): ReferenceFacets {
  const client = useBeacon()
  const wanted = useMemo(() => [...new Set(identifiers)].sort(), [identifiers])

  const reference = useQuery({
    queryKey: keys.data.referenceBatch(wanted, ['*']),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.data.referenceBatch(wanted, undefined, undefined, signal)
    },
    enabled: client !== null && wanted.length > 0
  })

  return useMemo(() => {
    const entries = reference.data?.entries ?? []
    const byIdentifier = new Map(
      entries.filter((entry) => entry.found).map((entry) => [entry.identifier, entry.fields ?? {}])
    )

    const candidates = [...byIdentifier].map(([identifier, fields]) => ({ identifier, fields }))
    return {
      specs: filtersFor(candidates),
      byIdentifier,
      loading: reference.isPending && wanted.length > 0
    }
  }, [reference.data, reference.isPending, wanted.length])
}

/**
 * The values a column takes, matched case-insensitively.
 *
 * py-beacon lowercases a column when it publishes it as a screenable field
 * — `SECTOR` becomes `reference.sector` — while the reference row is keyed
 * however the store spells it. Matching exactly would silently offer no
 * choices for every field, which reads as "this column has no values"
 * rather than as a join that missed.
 */
export function valuesFor(specs: readonly FilterSpec[], name: string): string[] {
  const match = specs.find((spec) => spec.field.toLowerCase() === name.toLowerCase())
  return match?.values ?? []
}
