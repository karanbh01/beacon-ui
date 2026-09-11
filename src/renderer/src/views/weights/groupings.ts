import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { keys } from '../../api/keys'
import { useBeacon } from '../../api/queryClient'
import { filtersFor, labelFor } from '../universe/builder'

export interface Grouping {
  /** Reference column, as the engine spells it. */
  field: string
  label: string
}

export interface Groupings {
  options: Grouping[]
  /** Which bucket a name belongs to, for the chosen field. */
  groupOf: (field: string) => (identifier: string) => string
  loading: boolean
}

/**
 * Ways to roll a weights table up, derived from the data (BU-177).
 *
 * Not a declared list of sector and country. The universe builder made this
 * choice first and it paid off — BN-128 added three reference columns and
 * six new filters appeared with no client change — and the same reasoning
 * holds here: hard-coding the dimensions ships pickers that are empty
 * whenever the reference frame does not carry them, and misses the ones it
 * does.
 *
 * Every categorical column becomes a grouping; the numeric ones do not,
 * because summing weights by market cap is not a question anyone asks.
 */
export function useGroupings(identifiers: readonly string[]): Groupings {
  const client = useBeacon()
  const wanted = useMemo(() => [...new Set(identifiers)].sort(), [identifiers])

  /*
   * Every field, not the table's usual three.
   *
   * `useReferenceRows` defaults to the numeric columns a constituent table
   * shows. Grouping needs the categorical ones, and which those are is the
   * engine's answer rather than ours — so the request names no fields at
   * all and takes what the reference frame holds.
   */
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
    const options = filtersFor(candidates)
      .filter((spec) => spec.kind === 'category')
      .map((spec) => ({ field: spec.field, label: labelFor(spec.field) }))

    const groupOf = (field: string) => (identifier: string) => {
      const value = byIdentifier.get(identifier)?.[field]
      // Named rather than dropped: a name the reference data cannot place
      // still holds weight, and losing it would change the column total.
      return typeof value === 'string' && value !== '' ? value : 'Unclassified'
    }

    return { options, groupOf, loading: reference.isPending && wanted.length > 0 }
  }, [reference.data, reference.isPending, wanted.length])
}
