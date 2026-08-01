import type { Point } from '../../charts/transform'
import { annualisedVolatility, sinceStart } from '../shared/indexMetrics'
import { cagr } from '../backtest/backtest'

export interface MetricRow {
  metric: string
  /** Index id → value. Undefined where it could not be computed. */
  values: Record<string, number | undefined>
  /** Whether a larger number is better, for the "Best" column. */
  higherIsBetter: boolean
  format: (value: number | undefined) => string
}

function signed(value: number | undefined, dp = 1): string {
  if (value === undefined) return '—'
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(dp)}%`
}

function plain(value: number | undefined, dp = 1): string {
  return value === undefined ? '—' : `${value.toFixed(dp)}%`
}

function ratio(value: number | undefined): string {
  return value === undefined ? '—' : value.toFixed(2)
}

/**
 * The comparison metrics table (Figma 359:2311).
 *
 * `/beacon/compare` returns rebased levels and a total return per entry, and
 * nothing else — no metrics block. Everything below the first row is
 * therefore derived from the levels, which is honest as long as the pane says
 * so. Sharpe is NOT included: it needs a risk-free rate, and inventing one
 * (or silently assuming zero) would make two indices look comparable on a
 * number neither engine nor design has defined.
 */
export function metricRows(series: Record<string, readonly Point[]>): MetricRow[] {
  const ids = Object.keys(series)
  const collect = (
    compute: (points: readonly Point[]) => number | undefined
  ): Record<string, number | undefined> =>
    Object.fromEntries(ids.map((id) => [id, compute(series[id] ?? [])]))

  return [
    {
      metric: 'Total return · since base',
      values: collect(sinceStart),
      higherIsBetter: true,
      format: (value) => signed(value)
    },
    {
      metric: 'CAGR',
      values: collect(cagr),
      higherIsBetter: true,
      format: (value) => plain(value)
    },
    {
      metric: 'Volatility · annualised',
      values: collect(annualisedVolatility),
      higherIsBetter: false,
      format: (value) => plain(value)
    },
    {
      metric: 'Return per unit of vol',
      values: collect((points) => {
        const growth = cagr(points)
        const vol = annualisedVolatility(points)
        if (growth === undefined || vol === undefined || vol === 0) return undefined
        return growth / vol
      }),
      higherIsBetter: true,
      format: ratio
    },
    {
      metric: 'Max drawdown',
      values: collect(maxDrawdownOf),
      // Less negative is better, and both are negative, so larger wins.
      higherIsBetter: true,
      format: (value) => signed(value)
    }
  ]
}

function maxDrawdownOf(points: readonly Point[]): number | undefined {
  if (points.length === 0) return undefined

  let peak = -Infinity
  let worst = 0
  for (const point of points) {
    peak = Math.max(peak, point.value)
    if (peak <= 0) continue
    worst = Math.min(worst, ((point.value - peak) / peak) * 100)
  }
  return worst
}

/**
 * Which index wins a row.
 *
 * Undefined when fewer than two entries carry a value, or when the best is
 * tied — declaring a winner among equals reads as a real difference.
 */
export function bestOf(row: MetricRow): string | undefined {
  const scored = Object.entries(row.values).filter(
    (entry): entry is [string, number] => entry[1] !== undefined
  )
  if (scored.length < 2) return undefined

  const sorted = [...scored].sort((a, b) => (row.higherIsBetter ? b[1] - a[1] : a[1] - b[1]))
  const [winner, runnerUp] = sorted
  if (winner === undefined || runnerUp === undefined) return undefined
  return winner[1] === runnerUp[1] ? undefined : winner[0]
}
