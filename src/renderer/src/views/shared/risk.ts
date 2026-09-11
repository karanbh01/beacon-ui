import type { Point } from '../../charts/transform'
import { dailyReturns, standardDeviation } from './periods'

/**
 * Risk figures derived from a level series (BU-176).
 *
 * Everything here is one day's horizon and comes off the plotted line, for
 * the same reason the period tables do: a risk number sourced separately
 * from the chart above it can disagree with it.
 */
const TRADING_DAYS = 252

/** Confidence levels offered, and the normal quantile each one needs. */
export const CONFIDENCES = [0.9, 0.95, 0.99] as const

export type Confidence = (typeof CONFIDENCES)[number]

/**
 * Standard-normal quantiles, tabulated rather than inverted.
 *
 * Three levels are on offer and an inverse-normal implementation for three
 * constants is code to maintain and get subtly wrong. If a fourth level is
 * ever wanted, that is the moment to write the function.
 */
const Z: Record<Confidence, number> = { 0.9: 1.2816, 0.95: 1.6449, 0.99: 2.3263 }

/**
 * Historical one-day VaR, as a positive percentage loss.
 *
 * The empirical quantile of the observed returns: no distribution assumed,
 * which is the point of it. Positive means a loss, so 2.1% reads as "a day
 * this bad or worse happens 5% of the time".
 *
 * Interpolation between the two neighbouring observations rather than
 * picking one, so the figure moves smoothly as the window grows instead of
 * stepping whenever an observation crosses the boundary.
 */
export function historicalVar(
  points: readonly Point[],
  confidence: Confidence
): number | undefined {
  const returns = dailyReturns(points)
  if (returns.length < 20) return undefined

  const sorted = [...returns].sort((a, b) => a - b)
  const position = (1 - confidence) * (sorted.length - 1)
  const lower = sorted[Math.floor(position)]
  const upper = sorted[Math.ceil(position)]
  if (lower === undefined || upper === undefined) return undefined

  const quantile = lower + (upper - lower) * (position - Math.floor(position))
  return -quantile * 100
}

/**
 * Parametric one-day VaR under a normal distribution, as a positive loss.
 *
 * Beside the historical figure rather than instead of it: where they
 * disagree, the disagreement is the information — fat tails show up exactly
 * as the historical number exceeding this one.
 */
export function parametricVar(
  points: readonly Point[],
  confidence: Confidence
): number | undefined {
  const returns = dailyReturns(points)
  if (returns.length < 20) return undefined

  const mean = returns.reduce((total, value) => total + value, 0) / returns.length
  return (Z[confidence] * standardDeviation(returns) - mean) * 100
}

/**
 * Mean loss on the days beyond the historical VaR — the conditional VaR.
 *
 * What VaR does not say: how bad it is when it is bad. A distribution can
 * have a comfortable 95% and a tail that ruins you.
 */
export function expectedShortfall(
  points: readonly Point[],
  confidence: Confidence
): number | undefined {
  const returns = dailyReturns(points)
  if (returns.length < 20) return undefined

  const sorted = [...returns].sort((a, b) => a - b)
  const count = Math.max(1, Math.floor((1 - confidence) * sorted.length))
  const tail = sorted.slice(0, count)
  const mean = tail.reduce((total, value) => total + value, 0) / tail.length
  return -mean * 100
}

export interface AlignedReturns {
  dates: string[]
  left: number[]
  right: number[]
}

/**
 * Two series' returns on the dates they share.
 *
 * `/beacon/compare` already rebases every entry onto the shared dates, so in
 * practice this is a formality — but a correlation of two arrays lined up by
 * POSITION rather than by date is the classic way to produce a confident
 * wrong number, and it fails silently.
 */
export function alignReturns(left: readonly Point[], right: readonly Point[]): AlignedReturns {
  const rightByDate = new Map(right.map((point) => [point.date, point.value]))
  const shared = left.filter((point) => rightByDate.has(point.date))

  const dates: string[] = []
  const a: number[] = []
  const b: number[] = []

  for (let i = 1; i < shared.length; i++) {
    const previous = shared[i - 1]
    const current = shared[i]
    if (previous === undefined || current === undefined || previous.value === 0) continue

    const before = rightByDate.get(previous.date)
    const now = rightByDate.get(current.date)
    if (before === undefined || now === undefined || before === 0) continue

    dates.push(current.date)
    a.push(current.value / previous.value - 1)
    b.push(now / before - 1)
  }

  return { dates, left: a, right: b }
}

/** Pearson correlation of two return arrays of the same length. */
export function correlationOf(
  left: readonly number[],
  right: readonly number[]
): number | undefined {
  if (left.length < 3 || left.length !== right.length) return undefined

  const meanLeft = left.reduce((total, value) => total + value, 0) / left.length
  const meanRight = right.reduce((total, value) => total + value, 0) / right.length

  let covariance = 0
  let varianceLeft = 0
  let varianceRight = 0
  for (let i = 0; i < left.length; i++) {
    const a = (left[i] ?? 0) - meanLeft
    const b = (right[i] ?? 0) - meanRight
    covariance += a * b
    varianceLeft += a * a
    varianceRight += b * b
  }

  const denominator = Math.sqrt(varianceLeft * varianceRight)
  return denominator === 0 ? undefined : covariance / denominator
}

/** Whole-period correlation between two level series. */
export function correlation(left: readonly Point[], right: readonly Point[]): number | undefined {
  const aligned = alignReturns(left, right)
  return correlationOf(aligned.left, aligned.right)
}

/**
 * Annualised volatility over a trailing window, one point per date.
 *
 * Stamped at the END of its window: the figure at a date describes the
 * `window` days up to and including it, which is the only reading that does
 * not use tomorrow's data to describe today.
 */
export function rollingVolatility(points: readonly Point[], window: number): Point[] {
  const returns = dailyReturns(points)
  if (returns.length < window) return []

  const rolled: Point[] = []
  for (let end = window; end <= returns.length; end++) {
    const slice = returns.slice(end - window, end)
    // Returns start one observation in, so return i is stamped at point i+1.
    const date = points[end]?.date
    if (date === undefined) continue
    rolled.push({ date, value: standardDeviation(slice) * Math.sqrt(TRADING_DAYS) * 100 })
  }
  return rolled
}

/** Correlation over a trailing window, stamped at the end of the window. */
export function rollingCorrelation(
  left: readonly Point[],
  right: readonly Point[],
  window: number
): Point[] {
  const aligned = alignReturns(left, right)
  if (aligned.left.length < window) return []

  const rolled: Point[] = []
  for (let end = window; end <= aligned.left.length; end++) {
    const value = correlationOf(
      aligned.left.slice(end - window, end),
      aligned.right.slice(end - window, end)
    )
    const date = aligned.dates[end - 1]
    if (value === undefined || date === undefined) continue
    rolled.push({ date, value })
  }
  return rolled
}

/**
 * Information ratio: excess return per unit of tracking error.
 *
 * Both annualised from the daily active return, which is what makes the
 * ratio comparable with a Sharpe. Undefined rather than infinite where the
 * tracking error is zero — an index measured against itself has no active
 * risk, and a division there says nothing.
 */
export function informationRatio(
  left: readonly Point[],
  right: readonly Point[]
): { excess: number; trackingError: number; ratio: number | undefined } | undefined {
  const aligned = alignReturns(left, right)
  if (aligned.left.length < 20) return undefined

  const active = aligned.left.map((value, index) => value - (aligned.right[index] ?? 0))
  const mean = active.reduce((total, value) => total + value, 0) / active.length

  const excess = mean * TRADING_DAYS * 100
  const trackingError = standardDeviation(active) * Math.sqrt(TRADING_DAYS) * 100

  return {
    excess,
    trackingError,
    ratio: trackingError === 0 ? undefined : excess / trackingError
  }
}
