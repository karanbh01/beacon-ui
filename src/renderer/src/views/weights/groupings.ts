import { useMemo } from 'react'
import { labelFor } from '../universe/builder'
import { useReferenceFacets } from '../shared/referenceFacets'

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
  const facets = useReferenceFacets(identifiers)

  return useMemo(() => {
    const options = facets.specs
      .filter((spec) => spec.kind === 'category')
      .map((spec) => ({ field: spec.field, label: labelFor(spec.field) }))

    const groupOf = (field: string) => (identifier: string) => {
      const value = facets.byIdentifier.get(identifier)?.[field]
      // Named rather than dropped: a name the reference data cannot place
      // still holds weight, and losing it would change the column total.
      return typeof value === 'string' && value !== '' ? value : 'Unclassified'
    }

    return { options, groupOf, loading: facets.loading }
  }, [facets])
}
