import { useMemo } from 'react'
import type { Point } from '../../charts/transform'
import { useCompare } from '../shared/beaconQueries'
import { toPoints } from '../shared/indexMetrics'

export interface ComparisonSeries {
  /** This strategy's run, on the axis shared with every comparator. */
  subject: Point[]
  /** Each comparator by id, on that same axis. */
  byId: Record<string, Point[]>
  isPending: boolean
  isError: boolean
}

/**
 * This strategy and its comparators on one axis (BU-176).
 *
 * `/strategies/compare` rebases every run onto the dates they all share,
 * which is exactly the alignment an excess return or a correlation needs —
 * and it is why the subject's series here comes from the comparison rather
 * than from `/overview`. Mixing the two would pair a date one run has
 * against a date the other does not, which is how a confident wrong number
 * is made. Comparators are other strategies' runs: the engine compares
 * nothing else since 0.9.0.
 *
 * The endpoint wants two ids, so with nothing to compare against this
 * returns empty rather than asking. A face with no benchmark chosen has
 * nothing to draw from it.
 */
export function useComparisonSeries(
  strategyId: string,
  others: readonly string[]
): ComparisonSeries {
  const ids = useMemo(
    () =>
      strategyId === ''
        ? []
        : [strategyId, ...others.filter((id) => id !== '' && id !== strategyId)],
    [strategyId, others]
  )
  const compare = useCompare(ids.length < 2 ? [] : ids)

  return useMemo(() => {
    const entries = compare.data?.entries ?? []
    const byId: Record<string, Point[]> = {}
    let subject: Point[] = []

    for (const entry of entries) {
      const points = toPoints(entry.level)
      if (entry.strategy_id === strategyId) subject = points
      else byId[entry.strategy_id] = points
    }

    return {
      subject,
      byId,
      isPending: compare.isPending && ids.length >= 2,
      isError: compare.isError
    }
  }, [compare.data, compare.isPending, compare.isError, strategyId, ids.length])
}
