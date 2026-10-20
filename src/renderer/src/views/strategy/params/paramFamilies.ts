import type { TypeSpec } from '../../index-definition/ruleCatalogue'
import { useBacktestOptions, type BacktestOptions } from '../../shared/strategyDocuments'

/**
 * The `/backtest/options` family a setting's entries take their types from,
 * as its `options` names it (BN-330): "signals" for a factor tilt's factors,
 * "replication_constraints" for an optimised replication's constraints.
 */
export function useFamily(family: string | null | undefined): readonly TypeSpec[] {
  const options = useBacktestOptions()
  if (family == null || options.data === undefined) return []
  const listed = options.data[family as keyof BacktestOptions]
  return Array.isArray(listed) ? (listed as TypeSpec[]) : []
}
