import type { components } from '@shared/api.generated'
import { fromFraction, percent, signedPercent } from '../shared/indexMetrics'
import type { Comparator, Comparators } from './comparators'

type Metrics = components['schemas']['BacktestMetrics']
type PeriodRow = components['schemas']['PeriodRow']
type PeriodComparison = components['schemas']['PeriodComparison']

/** Since inception first, then each period newest first. */
export interface StatColumn {
  key: string
  label: string
}

export interface StatRow {
  key: string
  label: string
  /** Formatted figure by column key; absent where the engine reports none. */
  values: Record<string, string>
}

/** One table of the face: a kind of statistic, and its rows. */
export interface StatGroup {
  key: string
  title: string
  rows: StatRow[]
}

export interface StatisticsMatrix {
  columns: StatColumn[]
  groups: StatGroup[]
}

export const SINCE_INCEPTION = 'since'

type Value = number | null | undefined

interface RowSpec {
  key: string
  label: string
  since: Value
  period: (row: PeriodRow) => Value
  format: (value: number) => string
}

const signed = (value: number): string => signedPercent(fromFraction(value), 2)
const plain = (value: number): string => percent(fromFraction(value), 2)
const share = (value: number): string => percent(fromFraction(value), 1)
const ratio = (value: number): string => value.toFixed(2)
const none = (): undefined => undefined

/**
 * Every statistic, by period, in a table per kind (Karan, 2026-10-18), all
 * of it py-beacon's (BN-323, BN-324): Since inception from the run's
 * metrics and comparisons, each period from `/strategies/{id}/periods`.
 * Nothing is worked out here; a figure the engine does not report for a
 * column shows as a dash.
 */
export function statisticsMatrix(
  metrics: Metrics | undefined,
  comparators: Comparators,
  periods: readonly PeriodRow[]
): StatisticsMatrix {
  const columns: StatColumn[] = [
    { key: SINCE_INCEPTION, label: 'Since inception' },
    ...[...periods].reverse().map((row) => ({ key: row.period, label: row.period }))
  ]

  const table = (key: string, title: string, specs: readonly RowSpec[]): StatGroup => ({
    key,
    title,
    rows: specs.map((spec) => ({
      key: spec.key,
      label: spec.label,
      values: Object.fromEntries([
        ...shown(SINCE_INCEPTION, spec.since, spec.format),
        ...periods.flatMap((row) => shown(row.period, spec.period(row), spec.format))
      ])
    }))
  })

  // An active strategy's benchmark is its index when it names no other,
  // in each period as since inception (see comparatorsOf).
  const benchmarkIn = (row: PeriodRow): PeriodComparison | null | undefined =>
    comparators.kind === 'active' ? (row.benchmark ?? row.index) : row.benchmark

  return {
    columns,
    groups: [
      table('returns', 'Returns', returns(metrics)),
      table('risk', 'Risk', risk(metrics)),
      ...(comparators.index === undefined
        ? []
        : [
            table(
              'index',
              `Against the index · ${comparators.index.id}`,
              against('Index', comparators.index, (row) => row.index)
            )
          ]),
      ...(comparators.benchmark === undefined
        ? []
        : [
            table(
              'benchmark',
              `Against the benchmark · ${comparators.benchmark.id}`,
              against('Benchmark', comparators.benchmark, benchmarkIn)
            )
          ])
    ]
  }
}

function returns(metrics: Metrics | undefined): RowSpec[] {
  return [
    {
      key: 'return',
      label: 'Total return',
      since: metrics?.total_return,
      period: (row) => row.strategy.total_return,
      format: signed
    },
    {
      key: 'annualised',
      label: 'Annualised return',
      since: metrics?.annualised_return,
      period: none,
      format: signed
    },
    {
      key: 'positive',
      label: 'Positive days',
      since: undefined,
      period: (row) => row.strategy.positive_days,
      format: share
    },
    {
      key: 'hit',
      label: 'Hit rate · monthly',
      since: metrics?.hit_rate_monthly,
      period: none,
      format: share
    }
  ]
}

function risk(metrics: Metrics | undefined): RowSpec[] {
  return [
    {
      key: 'volatility',
      label: 'Volatility',
      since: metrics?.volatility,
      period: (row) => row.strategy.volatility,
      format: plain
    },
    {
      key: 'drawdown',
      label: 'Max drawdown',
      since: metrics?.max_drawdown,
      period: (row) => row.strategy.max_drawdown,
      format: signed
    },
    {
      key: 'sharpe',
      label: 'Sharpe ratio',
      since: metrics?.sharpe_ratio,
      period: (row) => row.strategy.sharpe_ratio,
      format: ratio
    }
  ]
}

/** The strategy against one comparator: its return, the gap, and how closely it followed. */
function against(
  name: string,
  comparator: Comparator,
  inPeriod: (row: PeriodRow) => PeriodComparison | null | undefined
): RowSpec[] {
  const key = name.toLowerCase()
  const own = comparator.own
  const relative = comparator.relative
  return [
    {
      key: `${key}-return`,
      label: `${name} return`,
      since: own.total_return,
      period: (row) => inPeriod(row)?.own.total_return,
      format: signed
    },
    {
      key: `${key}-relative`,
      label: 'Relative return',
      since: relative.relative_return,
      period: (row) => inPeriod(row)?.relative.relative_return,
      format: signed
    },
    {
      key: `${key}-annualised`,
      label: 'Annualised relative return',
      since: relative.annualised_relative_return,
      period: none,
      format: signed
    },
    {
      key: `${key}-tracking`,
      label: 'Tracking error',
      since: relative.tracking_error,
      period: (row) => inPeriod(row)?.relative.tracking_error,
      format: plain
    },
    {
      key: `${key}-information`,
      label: 'Information ratio',
      since: relative.information_ratio,
      period: (row) => inPeriod(row)?.relative.information_ratio,
      format: ratio
    },
    {
      key: `${key}-correlation`,
      label: 'Correlation',
      since: relative.correlation,
      period: (row) => inPeriod(row)?.relative.correlation,
      format: (value) => value.toFixed(3)
    },
    {
      key: `${key}-beta`,
      label: 'Beta',
      since: relative.beta,
      period: (row) => inPeriod(row)?.relative.beta,
      format: ratio
    },
    {
      key: `${key}-hit`,
      label: `Months ahead of the ${key}`,
      since: relative.hit_rate_monthly,
      period: none,
      format: share
    }
  ]
}

function shown(
  column: string,
  value: Value,
  format: (value: number) => string
): [string, string][] {
  return value === null || value === undefined ? [] : [[column, format(value)]]
}
