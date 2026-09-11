import type { Point } from '../../charts/transform'

/**
 * Calendar buckets for a level series (BU-176).
 *
 * Every figure here is derived from the series the pane is already drawing
 * rather than asked for separately. That is the cross-view integrity rule
 * (taxonomy 10): a number fetched from a second source can disagree with the
 * line above it, and then neither is trusted. `BacktestMetrics` carries
 * whole-period figures only, so per-period anything has to come from here.
 */
export type Period = 'annual' | 'quarterly' | 'monthly'

export const PERIODS: readonly { value: Period; label: string }[] = [
  { value: 'annual', label: 'Annual' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'monthly', label: 'Monthly' }
]

/** Trading days in a year, for annualising a standard deviation. */
const TRADING_DAYS = 252

/** The bucket a date falls in: `2025`, `2025 Q3`, `2025-07`. */
export function bucketOf(date: string, period: Period): string {
  const year = date.slice(0, 4)
  if (period === 'annual') return year
  if (period === 'monthly') return date.slice(0, 7)

  const month = Number(date.slice(5, 7))
  return `${year} Q${String(Math.floor((month - 1) / 3) + 1)}`
}

export interface PeriodValue {
  bucket: string
  value: number
}

/**
 * Returns by bucket, each measured from the PREVIOUS bucket's close.
 *
 * So a quarter's return includes the move on its first day, which a
 * first-to-last reading inside the bucket would drop. The first bucket is
 * measured from its own first observation instead — a partial period, which
 * is what it is.
 *
 * Unless that first bucket holds a single observation: measured against
 * itself it can only ever report 0.0%, which reads as a period that went
 * nowhere rather than one that never traded. A stored record makes that
 * ordinary — its NAV opens on day zero, often the last day of the period
 * before the backtest starts (BU-169).
 */
export function periodReturns(points: readonly Point[], period: Period): PeriodValue[] {
  const closes = closesByBucket(points, period)
  const buckets = [...closes.keys()]
  const first = points[0]
  const rows: PeriodValue[] = []

  buckets.forEach((bucket, position) => {
    if (position === 0 && countIn(points, bucket, period) < 2) return

    const close = closes.get(bucket)
    const previous = position === 0 ? first?.value : closes.get(buckets[position - 1] ?? '')
    if (close === undefined || previous === undefined || previous === 0) return
    rows.push({ bucket, value: ((close - previous) / previous) * 100 })
  })

  return rows
}

export interface PeriodRow {
  bucket: string
  index: number | undefined
  benchmark: number | undefined
  excess: number | undefined
}

/** Both series by bucket, newest first, with the excess between them. */
export function periodTable(
  index: readonly Point[],
  benchmark: readonly Point[],
  period: Period
): PeriodRow[] {
  const left = new Map(periodReturns(index, period).map((row) => [row.bucket, row.value]))
  const right = new Map(periodReturns(benchmark, period).map((row) => [row.bucket, row.value]))
  const buckets = [...new Set([...left.keys(), ...right.keys()])].sort().reverse()

  return buckets.map((bucket) => {
    const a = left.get(bucket)
    const b = right.get(bucket)
    return {
      bucket,
      index: a,
      benchmark: b,
      excess: a === undefined || b === undefined ? undefined : a - b
    }
  })
}

/**
 * Annualised volatility WITHIN each bucket.
 *
 * Annualised even for a month, because that is how a volatility is quoted
 * and comparing an annualised figure to a monthly one is the mistake the
 * convention exists to prevent. A bucket with fewer than three observations
 * has no standard deviation worth the name and is left out rather than
 * reported as zero.
 */
export function periodVolatility(points: readonly Point[], period: Period): PeriodValue[] {
  const rows: PeriodValue[] = []

  for (const [bucket, slice] of groupBy(points, period)) {
    const daily = dailyReturns(slice)
    if (daily.length < 2) continue
    rows.push({ bucket, value: standardDeviation(daily) * Math.sqrt(TRADING_DAYS) * 100 })
  }

  return rows
}

/**
 * Worst peak-to-trough inside each bucket, as a negative percentage.
 *
 * Measured from the highest point within the bucket, not from the series
 * high: a quarter that fell 5% from its own peak did that, whatever the
 * index had done before it. The whole-period maximum is a different figure
 * and the engine already reports it.
 */
export function periodDrawdown(points: readonly Point[], period: Period): PeriodValue[] {
  const rows: PeriodValue[] = []

  for (const [bucket, slice] of groupBy(points, period)) {
    if (slice.length < 2) continue

    let peak = slice[0]?.value ?? 0
    let worst = 0
    for (const point of slice) {
      if (point.value > peak) peak = point.value
      if (peak > 0) worst = Math.min(worst, (point.value - peak) / peak)
    }
    rows.push({ bucket, value: worst * 100 })
  }

  return rows
}

/**
 * Share of buckets that closed above the one before.
 *
 * A plain count over the series — unlike Sortino, which needs a
 * minimum-acceptable-return convention the engine has not stated and is
 * therefore left out rather than guessed.
 */
export function hitRate(points: readonly Point[], period: Period): number | undefined {
  const closes = [...closesByBucket(points, period).values()]
  if (closes.length < 2) return undefined

  let up = 0
  for (let i = 1; i < closes.length; i++) {
    const now = closes[i]
    const before = closes[i - 1]
    if (now === undefined || before === undefined) continue
    if (now > before) up++
  }
  return (up / (closes.length - 1)) * 100
}

/** The best and worst buckets, for a table that would otherwise be scanned. */
export function extremes(rows: readonly PeriodValue[]): {
  best: PeriodValue | undefined
  worst: PeriodValue | undefined
} {
  if (rows.length === 0) return { best: undefined, worst: undefined }

  let best = rows[0]
  let worst = rows[0]
  for (const row of rows) {
    if (best === undefined || row.value > best.value) best = row
    if (worst === undefined || row.value < worst.value) worst = row
  }
  return { best, worst }
}

/** Simple returns between consecutive observations. */
export function dailyReturns(points: readonly Point[]): number[] {
  const returns: number[] = []
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]?.value
    const current = points[i]?.value
    if (previous === undefined || current === undefined || previous === 0) continue
    returns.push(current / previous - 1)
  }
  return returns
}

/** Sample standard deviation — n−1, because these are observations. */
export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0

  const mean = values.reduce((total, value) => total + value, 0) / values.length
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/** Points by bucket, in calendar order, keeping each bucket's own order. */
function groupBy(points: readonly Point[], period: Period): Map<string, Point[]> {
  const groups = new Map<string, Point[]>()
  for (const point of points) {
    const bucket = bucketOf(point.date, period)
    const slice = groups.get(bucket)
    if (slice === undefined) groups.set(bucket, [point])
    else slice.push(point)
  }
  return groups
}

/** Last observation in each bucket, in calendar order. */
function closesByBucket(points: readonly Point[], period: Period): Map<string, number> {
  const closes = new Map<string, number>()
  for (const point of points) {
    closes.set(bucketOf(point.date, period), point.value)
  }
  return closes
}

function countIn(points: readonly Point[], bucket: string, period: Period): number {
  return points.filter((point) => bucketOf(point.date, period) === bucket).length
}
