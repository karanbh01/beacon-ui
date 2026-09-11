import { useMemo } from 'react'
import type { Point } from '../../charts/transform'
import { useCompare } from '../shared/strategyQueries'
import { toPoints } from '../shared/indexMetrics'

export interface ComparisonSeries {
  /** This index, on the axis shared with every comparator. */
  index: Point[]
  /** Each comparator by id, on that same axis. */
  byId: Record<string, Point[]>
  isPending: boolean
  isError: boolean
}

/**
 * This index and its comparators on one axis (BU-176).
 *
 * `/beacon/compare` rebases every entry onto the dates they all share, which
 * is exactly the alignment an excess return or a correlation needs — and it
 * is why the index series here comes from the comparison rather than from
 * `/overview`. Mixing the two would pair a date the index has against a date
 * the benchmark does not, which is how a confident wrong number is made.
 *
 * The endpoint wants two ids, so with nothing to compare against this
 * returns empty rather than asking. A face with no benchmark chosen has
 * nothing to draw from it.
 */
export function useComparisonSeries(indexId: string, others: readonly string[]): ComparisonSeries {
  const ids = useMemo(
    () => (indexId === '' ? [] : [indexId, ...others.filter((id) => id !== '' && id !== indexId)]),
    [indexId, others]
  )
  const compare = useCompare(ids.length < 2 ? [] : ids)

  return useMemo(() => {
    const entries = compare.data?.entries ?? []
    const byId: Record<string, Point[]> = {}
    let index: Point[] = []

    for (const entry of entries) {
      const points = toPoints(entry.level)
      if (entry.index_id === indexId) index = points
      else byId[entry.index_id] = points
    }

    return {
      index,
      byId,
      isPending: compare.isPending && ids.length >= 2,
      isError: compare.isError
    }
  }, [compare.data, compare.isPending, compare.isError, indexId, ids.length])
}
