import type { Point } from './transform'

/**
 * The studies a price chart draws over itself, and the ones that need their
 * own pane (BU-157).
 *
 * Computed on the series AS DRAWN rather than on the raw close. Rebasing and
 * adjusting are both linear, so an average of the drawn line is the average
 * of what the reader is looking at — and RSI is scale-invariant, so it does
 * not care either way. The alternative, fetching a second copy of the prices
 * to average, would let the two disagree about which line is on screen.
 *
 * Every function returns points only where the window is complete. A moving
 * average that starts at the first bar is an average of one number, and
 * drawing it says the study begins before it can.
 */

/** Simple moving average, one point per complete window. */
export function sma(points: readonly Point[], period: number): Point[] {
  if (period <= 0 || points.length < period) return []

  const out: Point[] = []
  let sum = 0

  points.forEach((point, index) => {
    sum += point.value
    const dropped = points[index - period]
    if (dropped !== undefined) sum -= dropped.value
    if (index >= period - 1) out.push({ date: point.date, value: sum / period })
  })

  return out
}

/**
 * Exponential moving average, seeded with the simple average of the first
 * window — the convention every charting package uses, and the reason two
 * implementations of "EMA 12" agree from the second bar rather than the
 * fiftieth.
 */
export function ema(points: readonly Point[], period: number): Point[] {
  if (period <= 0 || points.length < period) return []

  const weight = 2 / (period + 1)
  const first = points[period - 1]
  if (first === undefined) return []

  let previous = points.slice(0, period).reduce((sum, point) => sum + point.value, 0) / period
  const out: Point[] = [{ date: first.date, value: previous }]

  for (const point of points.slice(period)) {
    previous = point.value * weight + previous * (1 - weight)
    out.push({ date: point.date, value: previous })
  }

  return out
}

export interface Macd {
  /** Fast EMA less slow EMA. */
  line: Point[]
  /** EMA of that line. */
  signal: Point[]
  /** Line less signal — the bars. */
  histogram: Point[]
}

/**
 * MACD, the usual 12/26/9.
 *
 * Joined on date rather than by index: the two EMAs start at different bars,
 * so subtracting them position by position would offset the whole study by
 * fourteen days and still look plausible.
 */
export function macd(points: readonly Point[], fast = 12, slow = 26, smoothing = 9): Macd {
  const quick = new Map(ema(points, fast).map((point) => [point.date, point.value]))
  const line = ema(points, slow).flatMap((point) => {
    const ahead = quick.get(point.date)
    return ahead === undefined ? [] : [{ date: point.date, value: ahead - point.value }]
  })

  const signal = ema(line, smoothing)
  const byDate = new Map(line.map((point) => [point.date, point.value]))
  const histogram = signal.flatMap((point) => {
    const value = byDate.get(point.date)
    return value === undefined ? [] : [{ date: point.date, value: value - point.value }]
  })

  return { line, signal, histogram }
}

/**
 * RSI with Wilder's smoothing, which is what "RSI 14" means everywhere.
 *
 * A simple average of gains and losses is a different indicator with the same
 * name and reads several points away from every other tool.
 */
export function rsi(points: readonly Point[], period = 14): Point[] {
  if (period <= 0 || points.length <= period) return []

  let gains = 0
  let losses = 0
  for (let index = 1; index <= period; index += 1) {
    const change = difference(points, index)
    if (change > 0) gains += change
    else losses -= change
  }

  gains /= period
  losses /= period

  const start = points[period]
  if (start === undefined) return []
  const out: Point[] = [{ date: start.date, value: strength(gains, losses) }]

  for (let index = period + 1; index < points.length; index += 1) {
    const point = points[index]
    if (point === undefined) continue
    const change = difference(points, index)
    gains = (gains * (period - 1) + Math.max(change, 0)) / period
    losses = (losses * (period - 1) + Math.max(-change, 0)) / period
    out.push({ date: point.date, value: strength(gains, losses) })
  }

  return out
}

function difference(points: readonly Point[], index: number): number {
  const now = points[index]
  const before = points[index - 1]
  return now === undefined || before === undefined ? 0 : now.value - before.value
}

/**
 * 100 when nothing has fallen: the ratio is undefined there, and the limit
 * of the formula as losses approach zero is the top of the scale.
 */
function strength(gains: number, losses: number): number {
  if (losses === 0) return gains === 0 ? 50 : 100
  return 100 - 100 / (1 + gains / losses)
}
