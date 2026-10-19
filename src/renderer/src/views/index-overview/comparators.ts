import { useMemo } from 'react'
import type { components } from '@shared/api.generated'
import type { Point } from '../../charts/transform'
import { useRunResult, type ComparisonPayload, type RunResult } from '../shared/beaconQueries'
import { toPoints } from '../shared/indexMetrics'

export type ComparatorFigures = components['schemas']['ComparatorFigures']
export type RelativeFigures = components['schemas']['RelativeFigures']

/** A series the strategy is measured against, with py-beacon's figures for it. */
export interface Comparator {
  /** Its id as a reader knows it: the index's id, or the benchmark's. */
  id: string
  /** Rebased to 100 on the first day it and the run share. */
  points: Point[]
  /** Its own figures, over the run's window. */
  own: ComparatorFigures
  /** The strategy against it. */
  relative: RelativeFigures
}

export interface Comparators {
  /** The strategy's kind: 'index', 'index_tracking' or 'active'. */
  kind: string
  index: Comparator | undefined
  benchmark: Comparator | undefined
}

/**
 * What a strategy is compared with, by what it is (Karan, 2026-10-18), and
 * every figure for it from the engine (py-beacon 0.9.2, BN-323).
 *
 * The index as defined, and a strategy tracking it, are measured against
 * that index, and against an external benchmark too when the run had one.
 * An active strategy is measured against a benchmark only: its external one
 * if the run named one, otherwise the index it is built against, which for
 * an active strategy is its benchmark.
 */
export function comparatorsOf(run: RunResult | undefined): Comparators {
  const kind = strategyKind(run)
  const index = comparatorOf(run?.comparisons?.index)
  const external = comparatorOf(run?.comparisons?.benchmark)

  if (kind === 'active') return { kind, index: undefined, benchmark: external ?? index }
  return { kind, index, benchmark: external }
}

export function useComparators(strategyId: string): Comparators & { isPending: boolean } {
  const result = useRunResult(strategyId)
  return useMemo(
    () => ({ ...comparatorsOf(result.data), isPending: result.isPending }),
    [result.data, result.isPending]
  )
}

function comparatorOf(payload: ComparisonPayload | null | undefined): Comparator | undefined {
  if (payload == null) return undefined
  return {
    id: payload.id,
    points: toPoints(payload.level),
    own: payload.own,
    relative: payload.relative
  }
}

/** What the run held, from its resolved settings; the plain index when they say nothing. */
function strategyKind(run: RunResult | undefined): string {
  const strategy = run?.settings?.strategy
  if (typeof strategy !== 'object' || strategy === null || !('type' in strategy)) return 'index'
  return typeof strategy.type === 'string' ? strategy.type : 'index'
}
