import type { Point } from '../charts/transform'

/**
 * A deterministic index level series, for chart work before a backtest exists.
 *
 * Generated rather than checked in as data: 500 points of JSON would be noise
 * in review, and the shape matters more than the numbers. Deterministic
 * because a chart that looks different on every reload cannot be compared
 * against a Figma frame — `Math.random` is deliberately not used.
 */
function lcg(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return state / 4_294_967_296
  }
}

export interface MockSeriesOptions {
  /** Trading days. 500 ≈ two years. */
  length?: number
  start?: string
  /** Mean daily return, as a fraction. */
  drift?: number
  volatility?: number
  seed?: number
  base?: number
}

export function mockLevels(options: MockSeriesOptions = {}): Point[] {
  const {
    length = 500,
    start = '2024-08-01',
    drift = 0.0004,
    volatility = 0.011,
    seed = 42,
    base = 100
  } = options

  const random = lcg(seed)
  const day = new Date(`${start}T00:00:00Z`)
  const points: Point[] = []
  let level = base

  for (let i = 0; i < length; i++) {
    // Skip weekends, so the time axis reads like a real trading calendar.
    do {
      day.setUTCDate(day.getUTCDate() + 1)
    } while (day.getUTCDay() === 0 || day.getUTCDay() === 6)

    // Box-Muller from two uniforms — a flat random walk has no fat tails and
    // never produces the drawdowns the subpanel exists to show.
    const shock = Math.sqrt(-2 * Math.log(random() || 1e-9)) * Math.cos(2 * Math.PI * random())
    level *= 1 + drift + volatility * shock
    points.push({ date: day.toISOString().slice(0, 10), value: Number(level.toFixed(4)) })
  }

  return points
}

/** Volume bars aligned to a level series, for the volume subpanel. */
export function mockVolume(levels: readonly Point[], seed = 7): Point[] {
  const random = lcg(seed)
  return levels.map((point) => ({
    date: point.date,
    value: Math.round(20_000_000 + random() * 60_000_000)
  }))
}
