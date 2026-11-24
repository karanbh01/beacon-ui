/**
 * A market and a fund on it that move as real ones do (Karan, 2026-11-23).
 *
 * The other fixtures' lines are sine waves: fine for a table, but a fund
 * regressed on its index draws a closed loop, which no real pair does. These
 * two are the stub's realistic run. The market's volatility clusters, a
 * GARCH(1,1) with fat-tailed shocks and one crash; the fund is a beta to it,
 * a small alpha and noise of its own, so its days scatter in a cloud about
 * a line as a real fund's do.
 *
 * Seeded, not random: the same line every run, so a test that reads a figure
 * off it fails the same way twice.
 */

export interface Level {
  index: string[]
  data: number[]
}

/** Five years of trading days and a little over, so a trailing 5Y has room. */
const DAYS = 1320
const START = Date.UTC(2020, 0, 2)

/** Mulberry32: small, seedable and good enough for a fixture. */
function generator(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A standard normal draw, by Box-Muller. */
function normal(next: () => number): number {
  const u = Math.max(next(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next())
}

/** A shock with fatter tails than a normal one: now and then a much larger day. */
function shock(next: () => number): number {
  const draw = normal(next)
  return next() < 0.04 ? draw * 2.4 : draw
}

/** Holidays on a fixed date, as MM-DD. */
const FIXED = new Set(['01-01', '06-19', '07-04', '12-25'])

/** Holidays on the nth weekday of a month, as [month, weekday, nth]; nth -1 is the last. */
const FLOATING: readonly (readonly [number, number, number])[] = [
  [0, 1, 3], // Martin Luther King Jr. Day
  [1, 1, 3], // Presidents' Day
  [4, 1, -1], // Memorial Day
  [8, 1, 1], // Labor Day
  [10, 4, 4] // Thanksgiving
]

/**
 * A day the market is shut: a weekend, or most of an exchange's holidays,
 * so a year has about the 252 days the figures annualise by.
 */
function closed(day: Date): boolean {
  const weekday = day.getUTCDay()
  if (weekday === 0 || weekday === 6) return true
  if (FIXED.has(day.toISOString().slice(5, 10))) return true
  const date = day.getUTCDate()
  const nth = Math.ceil(date / 7)
  const last =
    date + 7 > new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate()
  return FLOATING.some(
    ([month, on, which]) =>
      month === day.getUTCMonth() && on === weekday && (which === -1 ? last : which === nth)
  )
}

function businessDays(): string[] {
  const days: string[] = []
  const day = new Date(START)
  while (days.length < DAYS) {
    if (!closed(day)) days.push(`${day.toISOString().slice(0, 10)}T00:00:00`)
    day.setUTCDate(day.getUTCDate() + 1)
  }
  return days
}

function levelOf(index: string[], moves: readonly number[]): Level {
  let value = 100
  const data = [value]
  for (const move of moves.slice(1)) {
    value *= 1 + move
    data.push(Number(value.toFixed(4)))
  }
  return { index, data }
}

/**
 * The market's daily moves: about 20% a year in volatility and 9% in return,
 * calm and stormy spells in turn, and a crash some forty days in.
 */
function marketMoves(): number[] {
  const next = generator(20200102)
  const longRun = 0.0088 ** 2
  const [arch, garch] = [0.1, 0.87]
  let variance = longRun
  let last = 0
  const moves: number[] = []
  for (let day = 0; day < DAYS; day++) {
    variance = longRun * (1 - arch - garch) + arch * last ** 2 + garch * variance
    // A sell-off over a few weeks, then the rebound that follows one.
    const crash = day >= 38 && day < 55 ? -0.009 : day >= 55 && day < 75 ? 0.005 : 0
    const stress = day >= 38 && day < 75 ? 1.8 : 1
    // Only the surprise feeds the next day's variance, not the crash's drift.
    last = Math.sqrt(variance) * shock(next)
    moves.push(0.00036 + crash + stress * last)
  }
  return moves
}

/**
 * The fund's daily moves on the market's: a beta of 0.85, about 2% a year
 * of alpha, and noise of its own whose size follows the market's mood.
 */
function fundMoves(market: readonly number[]): number[] {
  const next = generator(7071)
  const average = market.reduce((sum, move) => sum + Math.abs(move), 0) / market.length
  return market.map((move) => {
    const mood = Math.min(3, 0.6 + (0.4 * Math.abs(move)) / average)
    return 0.00008 + 0.85 * move + 0.0055 * mood * shock(next)
  })
}

const days = businessDays()
const market = marketMoves()

/** The index the realistic run is measured on. */
export const MARKET_LEVEL: Level = levelOf(days, market)

/** The realistic run's own line. */
export const FUND_LEVEL: Level = levelOf(days, fundMoves(market))
