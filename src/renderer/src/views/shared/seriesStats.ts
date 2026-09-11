import type { components } from '@shared/api.generated'
import type { RunSeries } from '@shared/backtestRun'
import type { Point } from '../../charts/transform'

export type SeriesPayload = components['schemas']['SeriesPayload']
export type BacktestMetrics = components['schemas']['BacktestMetrics']

/**
 * A py-beacon Series as chart points.
 *
 * Nulls are dropped rather than plotted as zero — py-beacon documents NaN
 * arriving as null, and a zero would draw the index falling to nothing.
 */
export function toPoints(series: SeriesPayload | RunSeries | undefined): Point[] {
  if (series === undefined) return []

  const points: Point[] = []
  series.index.forEach((label, position) => {
    const value = series.data[position]
    if (typeof label !== 'string' || typeof value !== 'number' || !Number.isFinite(value)) return
    points.push({ date: label.slice(0, 10), value })
  })
  return points
}

/** Compound annual growth between the first and last level. */
export function cagr(points: readonly Point[]): number | undefined {
  const first = points[0]
  const last = points[points.length - 1]
  if (first === undefined || last === undefined || first.value <= 0) return undefined

  const years =
    (Date.parse(`${last.date}T00:00:00Z`) - Date.parse(`${first.date}T00:00:00Z`)) /
    (365.25 * 24 * 3600 * 1000)
  if (years <= 0) return undefined

  return ((last.value / first.value) ** (1 / years) - 1) * 100
}

export function signedPercent(value: number | undefined, dp = 1): string {
  if (value === undefined) return '—'
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(dp)}%`
}

/** py-beacon reports metrics as fractions: 0.0523 means 5.23%. */
export function fromFraction(value: number | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : value * 100
}
