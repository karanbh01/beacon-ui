import type { components } from '@shared/api.generated'
import type { Point } from '../../charts/transform'

export type SeriesPayload = components['schemas']['SeriesPayload']
export type BacktestMetrics = components['schemas']['BacktestMetrics']

/**
 * A py-beacon Series as chart points.
 *
 * Nulls are dropped rather than plotted as zero — py-beacon documents NaN
 * arriving as null, and a zero would draw the index falling to nothing.
 */
export function toPoints(series: SeriesPayload | undefined): Point[] {
  if (series === undefined) return []

  const points: Point[] = []
  series.index.forEach((label, position) => {
    const value = series.data[position]
    if (typeof label !== 'string' || typeof value !== 'number' || !Number.isFinite(value)) return
    points.push({ date: label.slice(0, 10), value })
  })
  return points
}

export interface AnnualRow {
  year: string
  index: number | undefined
  benchmark: number | undefined
  excess: number | undefined
}

/**
 * Calendar-year returns from a level series.
 *
 * Derived here rather than requested: `BacktestMetrics` carries whole-period
 * figures only, and the level series the engine already sent contains this
 * exactly. Each year is measured from the LAST level of the previous year, so
 * the first year in the series is measured from its own first observation —
 * a partial year, which is what it is.
 */
export function annualReturns(points: readonly Point[]): { year: string; value: number }[] {
  if (points.length === 0) return []

  const lastByYear = new Map<string, number>()
  for (const point of points) {
    lastByYear.set(point.date.slice(0, 4), point.value)
  }

  const years = [...lastByYear.keys()].sort()
  const first = points[0]
  const rows: { year: string; value: number }[] = []

  years.forEach((year, position) => {
    const close = lastByYear.get(year)
    const previous = position === 0 ? first?.value : lastByYear.get(years[position - 1] ?? '')
    if (close === undefined || previous === undefined || previous === 0) return
    rows.push({ year, value: ((close - previous) / previous) * 100 })
  })

  return rows
}

/** Year rows for both series, aligned, with the excess between them. */
export function annualTable(index: readonly Point[], benchmark: readonly Point[]): AnnualRow[] {
  const left = new Map(annualReturns(index).map((row) => [row.year, row.value]))
  const right = new Map(annualReturns(benchmark).map((row) => [row.year, row.value]))
  const years = [...new Set([...left.keys(), ...right.keys()])].sort().reverse()

  return years.map((year) => {
    const a = left.get(year)
    const b = right.get(year)
    return {
      year,
      index: a,
      benchmark: b,
      excess: a === undefined || b === undefined ? undefined : a - b
    }
  })
}

/**
 * Share of months that ended above where they started.
 *
 * Figma's "HIT RATE · MO". Not in `BacktestMetrics`, but the level series
 * contains it, and a hit rate is a plain count rather than a modelled
 * quantity — unlike Sortino, which needs a minimum-acceptable-return
 * convention the engine has not stated, and so is left out.
 */
export function monthlyHitRate(points: readonly Point[]): number | undefined {
  const lastByMonth = new Map<string, number>()
  for (const point of points) {
    lastByMonth.set(point.date.slice(0, 7), point.value)
  }

  const months = [...lastByMonth.keys()].sort()
  if (months.length < 2) return undefined

  let up = 0
  for (let i = 1; i < months.length; i++) {
    const now = lastByMonth.get(months[i] ?? '')
    const before = lastByMonth.get(months[i - 1] ?? '')
    if (now === undefined || before === undefined) continue
    if (now > before) up++
  }
  return (up / (months.length - 1)) * 100
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
