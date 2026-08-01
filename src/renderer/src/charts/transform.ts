import type { HistogramData, LineData, UTCTimestamp } from 'lightweight-charts'
import { findColumn, num, toRows, type FrameRow, type TableFrame } from '../api/frame'

export interface Point {
  /** ISO date, as py-beacon indexes its frames. */
  date: string
  value: number
}

/**
 * A frame's index and one column, as points.
 *
 * Rows the engine sent as null are dropped rather than plotted as zero: a gap
 * in a series is a gap, and a zero would draw a spike down to the axis that
 * no data supports.
 */
export function toPoints(frame: TableFrame | undefined, ...columns: string[]): Point[] {
  const column = findColumn(frame, ...columns)
  if (column === undefined) return []

  return toRows(frame)
    .map((row) => ({ date: isoDate(row), value: num(row, column) }))
    .filter((point): point is Point => point.date !== '' && point.value !== undefined)
}

function isoDate(row: FrameRow): string {
  return typeof row.index === 'string' ? row.index.slice(0, 10) : ''
}

/**
 * Seconds since the epoch, which is what lightweight-charts wants.
 *
 * Parsed as UTC midnight explicitly. `new Date('2026-07-28')` is already UTC,
 * but `new Date('2026-07-28T00:00:00')` is local — and py-beacon sends both
 * shapes depending on the endpoint, so the two would land on different days
 * either side of the date line.
 */
export function toTime(date: string): UTCTimestamp {
  return (Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / 1000) as UTCTimestamp
}

export function toLineData(points: readonly Point[]): LineData<UTCTimestamp>[] {
  return points.map((point) => ({ time: toTime(point.date), value: point.value }))
}

export function toHistogramData(points: readonly Point[]): HistogramData<UTCTimestamp>[] {
  return points.map((point) => ({ time: toTime(point.date), value: point.value }))
}

/**
 * Rebase a series so its first point is 100.
 *
 * The only honest way to draw two instruments at different price levels on
 * one axis. A leading zero or negative would make the ratio meaningless, so
 * the series is returned unchanged in that case rather than producing
 * infinities the chart would silently clip.
 */
export function rebase100(points: readonly Point[]): Point[] {
  const base = points[0]?.value
  if (base === undefined || base <= 0) return [...points]
  return points.map((point) => ({ date: point.date, value: (point.value / base) * 100 }))
}

/**
 * Percentage below the running peak, at each point.
 *
 * Always ≤ 0, which is why the subpanel is drawn downward. Computed from the
 * peak so far rather than the whole-series maximum: a drawdown measured
 * against a peak that has not happened yet is not a drawdown anyone lived
 * through.
 */
export function drawdown(points: readonly Point[]): Point[] {
  let peak = -Infinity

  return points.map((point) => {
    peak = Math.max(peak, point.value)
    const value = peak <= 0 ? 0 : ((point.value - peak) / peak) * 100
    return { date: point.date, value }
  })
}

/** The worst point of a drawdown series, for the subpanel caption. */
export function maxDrawdown(points: readonly Point[]): Point | undefined {
  return points.reduce<Point | undefined>(
    (worst, point) => (worst === undefined || point.value < worst.value ? point : worst),
    undefined
  )
}

/** Total return between the first and last point, as a percentage. */
export function totalReturn(points: readonly Point[]): number | undefined {
  const first = points[0]?.value
  const last = points[points.length - 1]?.value
  if (first === undefined || last === undefined || first <= 0) return undefined
  return ((last - first) / first) * 100
}
