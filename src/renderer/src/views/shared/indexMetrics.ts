import type { components } from '@shared/api.generated'
import type { Point } from '../../charts/transform'
import type { SeriesPayload } from '../backtest/backtest'
import { toPoints } from '../backtest/backtest'

export { toPoints }

type ConstituentRow = components['schemas']['ConstituentRow']
export type { SeriesPayload }

/**
 * Figures every index view needs, derived from a level series.
 *
 * py-beacon reports whole-period metrics on `/overview` but not period slices,
 * so 1D and YTD are computed from the series it already sent rather than
 * asked for — a second round trip for two numbers implied by data in hand
 * would be slower and could disagree with the chart beneath it.
 */

export function lastValue(points: readonly Point[]): number | undefined {
  return points[points.length - 1]?.value
}

function changeBetween(from: number | undefined, to: number | undefined): number | undefined {
  if (from === undefined || to === undefined || from === 0) return undefined
  return ((to - from) / from) * 100
}

/** Move since the previous observation. */
export function oneDay(points: readonly Point[]): number | undefined {
  return changeBetween(points[points.length - 2]?.value, lastValue(points))
}

/**
 * Year to date, measured from the last level of the previous calendar year.
 *
 * Not from the first observation of this year: an index that gapped on 2
 * January would otherwise show none of the move everyone means by YTD.
 */
export function yearToDate(points: readonly Point[]): number | undefined {
  const last = points[points.length - 1]
  if (last === undefined) return undefined

  const year = last.date.slice(0, 4)
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i]
    if (point === undefined || point.date.slice(0, 4) === year) continue
    return changeBetween(point.value, last.value)
  }
  // The series starts inside this year, so YTD is the whole of it.
  return changeBetween(points[0]?.value, last.value)
}

/** Growth from the first observation — "since base" on a level series. */
export function sinceStart(points: readonly Point[]): number | undefined {
  return changeBetween(points[0]?.value, lastValue(points))
}

/**
 * Annualised standard deviation of daily returns.
 *
 * Derived only where py-beacon has not already reported it: `/overview`
 * carries `metrics.volatility` for the index itself, and this exists for
 * comparison entries, which come back as levels with no metrics attached.
 */
export function annualisedVolatility(points: readonly Point[]): number | undefined {
  if (points.length < 3) return undefined

  const returns: number[] = []
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]?.value
    const current = points[i]?.value
    if (previous === undefined || current === undefined || previous === 0) continue
    returns.push(current / previous - 1)
  }
  if (returns.length < 2) return undefined

  const mean = returns.reduce((total, value) => total + value, 0) / returns.length
  const variance =
    returns.reduce((total, value) => total + (value - mean) ** 2, 0) / (returns.length - 1)

  return Math.sqrt(variance * 252) * 100
}

/** py-beacon reports fractions: 0.0523 means 5.23%. */
export function fromFraction(value: number | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : value * 100
}

export function signedPercent(value: number | undefined, dp = 1): string {
  if (value === undefined) return '—'
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(dp)}%`
}

export function percent(value: number | undefined, dp = 1): string {
  return value === undefined ? '—' : `${value.toFixed(dp)}%`
}

export function tone(value: number | undefined): 'positive' | 'negative' | 'default' {
  if (value === undefined || value === 0) return 'default'
  return value > 0 ? 'positive' : 'negative'
}

/** Weights as rows, heaviest first, with each one's share of the largest. */
export interface WeightRow {
  /** 1-based position by weight, so the table can show a rank column. */
  rank: number
  ticker: string
  weight: number
  /** 0–1 against the heaviest name, for the inline bar. */
  share: number
  capped: boolean
  /** Weight before the cap was applied. Only rows carry it. */
  rawWeight?: number
  shares?: number
  /** This name's own move since the rebalance, not the aggregate drift. */
  delta?: number
  riskContribution?: number
}

/**
 * Rows from `WeightsView.rows` (BN-123), which is the per-constituent
 * breakdown the pane used to have no source for.
 *
 * `weights` — the identifier→fraction map — is still the fallback, because a
 * response without `rows` is a valid one and the table should still draw.
 * Everything the map cannot supply is left undefined rather than defaulted:
 * a share count of zero is a claim, and absent is the truth.
 */
export function constituentRows(rows: readonly ConstituentRow[]): WeightRow[] {
  const sorted = [...rows].sort((a, b) => b.weight - a.weight)
  const heaviest = sorted[0]?.weight ?? 0

  return sorted.map((row, position) => ({
    rank: position + 1,
    ticker: row.identifier,
    weight: row.weight,
    share: heaviest === 0 ? 0 : row.weight / heaviest,
    capped: row.capped,
    // raw_weight is required on the row; the rest are nullable.
    rawWeight: row.raw_weight,
    ...(row.shares_outstanding === null || row.shares_outstanding === undefined
      ? {}
      : { shares: row.shares_outstanding }),
    ...(row.delta_since_rebalance === null || row.delta_since_rebalance === undefined
      ? {}
      : { delta: row.delta_since_rebalance }),
    ...(row.risk_contribution === null || row.risk_contribution === undefined
      ? {}
      : { riskContribution: row.risk_contribution })
  }))
}

export function weightRows(
  weights: Record<string, number>,
  capped: readonly string[] = []
): WeightRow[] {
  const entries = Object.entries(weights).sort(([, a], [, b]) => b - a)
  const heaviest = entries[0]?.[1] ?? 0
  const cappedSet = new Set(capped)

  return entries.map(([ticker, weight], position) => ({
    rank: position + 1,
    ticker,
    weight,
    share: heaviest === 0 ? 0 : weight / heaviest,
    capped: cappedSet.has(ticker)
  }))
}
