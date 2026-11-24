import type { components } from '@shared/api.generated'
import { fromFraction, percent, signedPercent } from '../shared/indexMetrics'
import {
  namedComparators,
  type ComparatorRole,
  type Comparators,
  type RelativeFigures
} from './comparators'
import type { Frequency } from '../shared/periods'

type Metrics = components['schemas']['BacktestMetrics']
type PeriodRow = components['schemas']['PeriodRow']
type PeriodComparison = components['schemas']['PeriodComparison']

export const SINCE_INCEPTION = 'since'

/** A column within each period: the fund, or a series it is measured against. */
export type Book = 'fund' | ComparatorRole

/** What each book's column is headed, and its charts' legends say. */
export const BOOK_HEADERS: Record<Book, string> = {
  fund: 'Fund',
  index: 'Index',
  benchmark: 'BM',
  both: 'Index/BM'
}

/** A group of columns: since inception, or one calendar period or trailing window. */
export interface PerformancePeriod {
  key: string
  label: string
  /** The close it runs from and its last day; since inception has neither. */
  span?: { start: string; end: string }
}

export interface PerformanceRow {
  key: string
  label: string
  /** The heading it sits under. */
  group: string
  /** Signed figures are toned, as Summary's are. */
  signed: boolean
  format: (value: number) => string
  /** Figure by period, then by book; absent where the engine gives none. */
  values: Record<string, Partial<Record<Book, number>>>
}

export interface PerformanceMatrix {
  /** Since inception first, then each period oldest first, so the newest is on the right. */
  periods: PerformancePeriod[]
  books: Book[]
  rows: PerformanceRow[]
}

type Value = number | null | undefined

/**
 * Figures Performance asks py-beacon for (Karan, 2026-11-23) that no schema
 * carries yet. The stub serves them under these names, its guess; the engine
 * leaves them out, and a row with nothing in it drops away.
 */
type RequestedOwn =
  | 'best_day'
  | 'worst_day'
  | 'average_gain'
  | 'average_loss'
  | 'sortino_ratio'
  | 'calmar_ratio'
  | 'probabilistic_sharpe_ratio'
type RequestedRelative =
  | 'alpha'
  | 'alpha_t_stat'
  | 'r_squared'
  | 'residual_risk'
  | 'treynor_ratio'
  | 'information_ratio_t_stat'

/** One book's figures in one column: the fund's own, or a comparator's and the fund against it. */
interface Figures {
  own: Partial<Record<OwnKey, Value>>
  relative: Partial<RelativeFigures & Record<RequestedRelative, Value>> | undefined
}

type OwnKey =
  | 'total_return'
  | 'annualised_return'
  | 'money_weighted_return'
  | 'volatility'
  | 'max_drawdown'
  | 'sharpe_ratio'
  | 'hit_rate_monthly'
  | 'positive_days'
  | RequestedOwn

interface RowSpec {
  key: string
  label: string
  signed: boolean
  format: (value: number) => string
  /** Its figure for a book; the fund has none of the figures against a comparator. */
  pick: (figures: Figures, book: Book) => Value
  /** A figure that means nothing over one calendar period or trailing window. */
  sinceOnly?: boolean
  /**
   * An annual rate: since inception, and in trailing windows of a year or more
   * (Karan, 2026-11-24). A shorter span annualised would overstate it, and a
   * calendar year's is its total return again.
   */
  annual?: boolean
  /** A ratio a month is too short to measure: since inception only when monthly (Karan, 2026-11-23). */
  sinceOnlyMonthly?: boolean
}

const signed = (value: number): string => signedPercent(fromFraction(value), 2)
const plain = (value: number): string => percent(fromFraction(value), 2)
const share = (value: number): string => percent(fromFraction(value), 1)
const ratio = (value: number): string => value.toFixed(2)

const own =
  (key: OwnKey) =>
  (figures: Figures): Value =>
    figures.own[key]
const fundOnly =
  (key: OwnKey) =>
  (figures: Figures, book: Book): Value =>
    book === 'fund' ? figures.own[key] : undefined
const against =
  (key: keyof RelativeFigures | RequestedRelative) =>
  (figures: Figures, book: Book): Value =>
    book === 'fund' ? undefined : figures.relative?.[key]

const RETURNS: readonly RowSpec[] = [
  { key: 'return', label: 'Total return', signed: true, format: signed, pick: own('total_return') },
  {
    key: 'annualised',
    label: 'Annualised return',
    signed: true,
    format: signed,
    pick: own('annualised_return'),
    annual: true
  },
  {
    key: 'money-weighted',
    label: 'Money-weighted return',
    signed: true,
    format: signed,
    // The investors' annual rate, so shown where the annualised return is.
    pick: fundOnly('money_weighted_return'),
    annual: true
  },
  { key: 'best', label: 'Best day', signed: false, format: plain, pick: own('best_day') },
  { key: 'worst', label: 'Worst day', signed: false, format: plain, pick: own('worst_day') },
  { key: 'gain', label: 'Average gain', signed: false, format: plain, pick: own('average_gain') },
  { key: 'loss', label: 'Average loss', signed: false, format: plain, pick: own('average_loss') },
  {
    key: 'positive',
    label: 'Positive days',
    signed: false,
    format: share,
    pick: own('positive_days')
  },
  {
    key: 'hit',
    label: 'Hit rate · monthly',
    signed: false,
    format: share,
    pick: own('hit_rate_monthly'),
    sinceOnly: true
  }
]

const RISK: readonly RowSpec[] = [
  { key: 'volatility', label: 'Volatility', signed: false, format: plain, pick: own('volatility') },
  {
    key: 'drawdown',
    label: 'Max drawdown',
    signed: false,
    format: plain,
    pick: own('max_drawdown')
  }
]

const RISK_ADJUSTED: readonly RowSpec[] = [
  {
    key: 'sharpe',
    label: 'Sharpe ratio',
    signed: false,
    format: ratio,
    pick: own('sharpe_ratio'),
    sinceOnlyMonthly: true
  },
  {
    key: 'sortino',
    label: 'Sortino ratio',
    signed: false,
    format: ratio,
    pick: own('sortino_ratio'),
    sinceOnlyMonthly: true
  },
  {
    key: 'calmar',
    label: 'Calmar ratio',
    signed: false,
    format: ratio,
    // The annualised return over the drawdown, so shown where that return is.
    pick: own('calmar_ratio'),
    annual: true
  },
  {
    key: 'psr',
    label: 'Probabilistic Sharpe',
    signed: false,
    format: share,
    pick: own('probabilistic_sharpe_ratio'),
    sinceOnlyMonthly: true
  }
]

const TRACKING: readonly RowSpec[] = [
  {
    // The engine's relative return: the fund's total return less the comparator's.
    key: 'tracking-difference',
    label: 'Tracking difference',
    signed: true,
    format: signed,
    pick: against('relative_return')
  },
  {
    key: 'tracking',
    label: 'Tracking error',
    signed: false,
    format: plain,
    pick: against('tracking_error')
  },
  {
    key: 'information',
    label: 'Information ratio',
    signed: false,
    format: ratio,
    pick: against('information_ratio'),
    sinceOnlyMonthly: true
  },
  {
    key: 'information-t',
    label: 'Information ratio t-stat',
    signed: false,
    format: ratio,
    pick: against('information_ratio_t_stat'),
    sinceOnlyMonthly: true
  },
  {
    // The engine's relative hit rate: the share of months the fund beat the comparator.
    key: 'batting',
    label: 'Batting average',
    signed: false,
    format: share,
    pick: against('hit_rate_monthly'),
    sinceOnlyMonthly: true
  }
]

const REGRESSION: readonly RowSpec[] = [
  { key: 'beta', label: 'Beta', signed: false, format: ratio, pick: against('beta') },
  {
    key: 'correlation',
    label: 'Correlation',
    signed: false,
    format: ratio,
    pick: against('correlation')
  },
  { key: 'r-squared', label: 'R²', signed: false, format: ratio, pick: against('r_squared') },
  {
    key: 'alpha',
    label: 'Alpha',
    signed: true,
    format: signed,
    pick: against('alpha'),
    sinceOnlyMonthly: true
  },
  {
    key: 'alpha-t',
    label: 'Alpha t-stat',
    signed: false,
    format: ratio,
    pick: against('alpha_t_stat'),
    sinceOnlyMonthly: true
  },
  {
    key: 'residual',
    label: 'Residual risk',
    signed: false,
    format: plain,
    pick: against('residual_risk')
  },
  {
    key: 'treynor',
    label: 'Treynor ratio',
    signed: false,
    format: plain,
    pick: against('treynor_ratio'),
    sinceOnlyMonthly: true
  }
]

/**
 * The rows under their headings, in Karan's table's order (2026-11-23): what
 * it returned, how risky that was and what the risk earned, then how closely
 * it followed what it is measured on and how much of it that explains. A
 * figure of the fund against a comparator is under the comparator's column,
 * as Summary's table has it. The drawdown and the best and worst days are
 * never toned: all one colour would say nothing.
 */
const GROUPS: readonly { label: string; rows: readonly RowSpec[] }[] = [
  { label: 'Returns', rows: RETURNS },
  { label: 'Risk', rows: RISK },
  { label: 'Risk-adjusted', rows: RISK_ADJUSTED },
  { label: 'Tracking', rows: TRACKING },
  { label: 'Regression', rows: REGRESSION }
]

/**
 * Every figure by period (Karan, 2026-11-23): since inception and each
 * calendar period a group of columns, the fund and each series it is
 * measured on a column within it, as Summary's table is laid out. All of it
 * py-beacon's (BN-323, BN-324): since inception from the run, each period
 * from `/strategies/{id}/periods`. A figure the engine does not give for a
 * column, such as a calendar period's annualised return, shows a dash.
 */
export function performanceMatrix(
  metrics: Metrics | undefined,
  comparators: Comparators,
  periods: readonly PeriodRow[],
  frequency: Frequency
): PerformanceMatrix {
  const named = namedComparators(comparators)
  const books: Book[] = ['fund', ...named.map(({ role }) => role)]

  const since: Record<Book, Figures | undefined> = {
    fund: { own: metrics ?? {}, relative: undefined },
    index: undefined,
    benchmark: undefined,
    both: undefined
  }
  for (const { comparator, role } of named) {
    since[role] = { own: comparator.own, relative: comparator.relative }
  }

  const byPeriod = (row: PeriodRow): Record<Book, Figures | undefined> => ({
    fund: { own: row.strategy, relative: undefined },
    index: comparison(row.index),
    benchmark: comparison(benchmarkIn(row, comparators)),
    both: comparison(row.index ?? row.benchmark)
  })

  const columns: (PerformancePeriod & { figures: Record<Book, Figures | undefined> })[] = [
    { key: SINCE_INCEPTION, label: 'SI', figures: since },
    ...periods.map((row) => ({
      key: row.period,
      label: row.period,
      span: { start: row.start, end: row.end },
      figures: byPeriod(row)
    }))
  ]

  const specs = GROUPS.flatMap(({ label, rows }) => rows.map((spec) => ({ group: label, spec })))
  const rows = specs.map(({ group, spec }): PerformanceRow => {
    const values: PerformanceRow['values'] = {}
    for (const column of columns) {
      if (!shownIn(spec, column, frequency)) continue
      values[column.key] = Object.fromEntries(
        books.flatMap((book) => {
          const figures = column.figures[book]
          const value = figures === undefined ? undefined : spec.pick(figures, book)
          return value === null || value === undefined ? [] : [[book, value]]
        })
      )
    }
    const { key, label, signed, format } = spec
    return { key, label, group, signed, format, values }
  })

  return {
    periods: columns.map(({ key, label, span }) =>
      span === undefined ? { key, label } : { key, label, span }
    ),
    books,
    // A row with no figure anywhere says nothing.
    rows: rows.filter((row) => Object.values(row.values).some((each) => Object.keys(each).length))
  }
}

/** Whether a row has a figure in a column at all, whatever the engine sends. */
function shownIn(spec: RowSpec, column: PerformancePeriod, frequency: Frequency): boolean {
  if (column.span === undefined) return true
  if (spec.sinceOnly === true) return false
  if (spec.annual === true) return frequency === 'trailing' && yearOrMore(column.span)
  // A month is too short for a ratio, a calendar one or the trailing one.
  const month = frequency === 'monthly' || (frequency === 'trailing' && column.key === '1M')
  return !(spec.sinceOnlyMonthly === true && month)
}

/** A year, less a few days' slack for where the engine puts a window's first close. */
const YEAR_DAYS = 360

function yearOrMore(span: { start: string; end: string }): boolean {
  return (Date.parse(span.end) - Date.parse(span.start)) / 86_400_000 >= YEAR_DAYS
}

function comparison(payload: PeriodComparison | null | undefined): Figures | undefined {
  if (payload == null) return undefined
  return { own: payload.own, relative: payload.relative }
}

/**
 * An active strategy's benchmark is its index when it names no other, in
 * each period as since inception (see comparatorsOf).
 */
function benchmarkIn(
  row: PeriodRow,
  comparators: Comparators
): PeriodComparison | null | undefined {
  return comparators.kind === 'active' ? (row.benchmark ?? row.index) : row.benchmark
}
