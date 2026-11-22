import type { Line, Lines } from './stubAnalytics'

/**
 * Risk & correlation's tables as the stub answers them.
 *
 * The frontier, the return distribution, value at risk and the crises are
 * py-beacon d817ec8's shapes (BN-429, BN-430, BN-431). The market
 * correlations are provisional: the store holds no market series yet, so the
 * stub makes its own from the index line (Karan's call which to add).
 */

type Cell = string | number | boolean | null

export interface RiskAnswer {
  rows: Cell[][]
  summary?: Record<string, Cell>
}

/** A steady sequence in [0, 1) from a seed, so a table is the same on every read. */
function random(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

function seedOf(text: string): number {
  let hash = 2166136261
  for (let at = 0; at < text.length; at += 1) {
    hash ^= text.charCodeAt(at)
    hash = Math.imul(hash, 16777619)
  }
  return hash
}

const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / Math.max(1, values.length)
const deviation = (values: readonly number[]): number => {
  const centre = mean(values)
  return Math.sqrt(mean(values.map((value) => (value - centre) ** 2)))
}
const day = (stamp: string | undefined): string => (stamp ?? '').slice(0, 10)

/**
 * Daily returns for the distribution, value at risk and the correlations.
 *
 * The stub's level lines are sine waves, whose returns pile up at both ends
 * rather than in the middle, and whose correlations swing like a clock. As
 * the risk box's tracking error does, these tables take returns of their own
 * instead: one market factor with fat tails, each book and market series a
 * beta to it plus noise of its own. Bonds turn from hedging equities to
 * moving with them part way through, so the rolling chart has something to
 * show.
 */
function factorReturns(lines: Lines): Map<string, number[]> {
  const length = Math.max(0, lines.strategy.data.length - 1)
  const next = random(seedOf('market factor'))
  const normal = (): number =>
    Math.sqrt(-2 * Math.log(next() || 1e-9)) * Math.cos(2 * Math.PI * next())
  // A Student's t with four degrees of freedom, scaled to a unit variance.
  const fat = (): number =>
    (normal() / Math.sqrt((normal() ** 2 + normal() ** 2 + normal() ** 2 + normal() ** 2) / 4)) *
    Math.SQRT1_2
  // A stormier stretch a third of the way in, so volatility has a range to show.
  const storm = (at: number): number => (at > length * 0.3 && at < length * 0.45 ? 1.8 : 1)
  const market = Array.from({ length }, (_, at) => 0.0004 + 0.009 * storm(at) * fat())
  const own = (beta: (at: number) => number, noise: number): number[] =>
    market.map((value, at) => beta(at) * value + noise * normal())
  const turn = (early: number, late: number) => (at: number) => (at < length * 0.6 ? early : late)
  const index = own(() => 1.05, 0.004)
  const out = new Map<string, number[]>([
    ['fund', index.map((value) => 0.9 * value + 0.0035 * normal())],
    ['index', index]
  ])
  if (lines.benchmark !== undefined)
    out.set(
      'benchmark',
      own(() => 0.9, 0.006)
    )
  for (const [code, , early, late, noise] of MARKETS) out.set(code, own(turn(early, late), noise))
  return out
}

/** Weekly returns, Friday to Friday as near as the business days allow. */
function weekly(line: Line): { returns: number[]; first: string; last: string } {
  const picked = line.data.filter((_, at) => at % 5 === 0)
  const dates = line.index.filter((_, at) => at % 5 === 0)
  return {
    returns: picked.slice(1).map((value, at) => value / (picked[at] ?? value) - 1),
    first: day(dates[1]),
    last: day(dates.at(-1))
  }
}

/** Return and volatility as py-beacon measures them: the mean weekly return × 52. */
function measured(line: Line): [number, number, number, string, string] {
  const { returns, first, last } = weekly(line)
  return [mean(returns) * 52, deviation(returns) * Math.sqrt(52), returns.length, first, last]
}

function books(lines: Lines): [string, Line][] {
  const out: [string, Line][] = [
    ['fund', lines.strategy],
    ['index', lines.index]
  ]
  if (lines.benchmark !== undefined) out.push(['benchmark', lines.benchmark])
  return out
}

/*
 * The frontier, member dots and markers share one shape: a hyperbola from the
 * minimum-variance point, set above every portfolio so the fund and its
 * comparators sit inside it, as a hindsight frontier puts them.
 */
interface Curve {
  floor: number
  base: number
  slope: number
  at: (volatility: number) => number
}

function curveOf(lines: Lines): Curve {
  const marks = books(lines).map(([, line]) => measured(line))
  const floor = 0.8 * Math.min(...marks.map((mark) => mark[1]))
  const base = mean(marks.map((mark) => mark[0])) - 0.01
  const slope = Math.max(
    0.6,
    ...marks.map(
      (mark) => (mark[0] + 0.03 - base) / Math.sqrt(Math.max(1e-6, mark[1] ** 2 - floor ** 2))
    )
  )
  return {
    floor,
    base,
    slope,
    at: (volatility) => base + slope * Math.sqrt(Math.max(0, volatility ** 2 - floor ** 2))
  }
}

const MEMBERS = 480
const TOO_SHORT = 9
const LATEST = 100
const HELD = 10
/** The best name, which the frontier ends at. */
const BEST_VOLATILITY = 0.48

function memberRows(lines: Lines, run: string): Cell[][] {
  const curve = curveOf(lines)
  const next = random(seedOf(`${run}/members`))
  const { first, last } = weekly(lines.strategy)
  const weeks = weekly(lines.strategy).returns.length
  const rows = Array.from({ length: MEMBERS }, (_, at): Cell[] => {
    const volatility = at === 0 ? BEST_VOLATILITY : 0.15 + 0.45 * next() ** 1.3
    const gap = at === 0 ? 0 : 0.01 - 0.09 * Math.log(next() || 1e-6)
    const latest = at < LATEST
    // A name that joined late or left early was measured over fewer weeks.
    const share = latest ? 1 : 0.35 + 0.6 * next()
    const index = latest ? 0.06 * 0.96 ** at : null
    return [
      `CMP${String(at).padStart(3, '0')}`,
      curve.at(volatility) - gap,
      volatility,
      Math.round(weeks * share),
      first,
      last,
      latest,
      at < HELD ? 0.1 : null,
      index
    ]
  })
  return rows.sort((one, other) => String(one[0]).localeCompare(String(other[0])))
}

function frontierRows(lines: Lines): Cell[][] {
  const curve = curveOf(lines)
  const top = curve.at(BEST_VOLATILITY)
  return Array.from({ length: 50 }, (_, at) => {
    const target = curve.base + ((top - curve.base) * at) / 49
    const volatility = Math.sqrt(curve.floor ** 2 + ((target - curve.base) / curve.slope) ** 2)
    return [volatility, target, at === 0]
  })
}

/** The standard normal's distribution function (Abramowitz and Stegun 26.2.17). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const density = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI)
  const tail =
    density *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z >= 0 ? 1 - tail : tail
}

const BINS = 50

function distributionRows(lines: Lines): Cell[][] {
  const series = factorReturns(lines)
  const returns = books(lines).map(([book]) => series.get(book) ?? [])
  const all = returns.flat()
  const low = Math.min(...all)
  const width = (Math.max(...all) - low) / BINS || 1e-4
  const fund = returns[0] ?? []
  const centre = mean(fund)
  const spread = deviation(fund) || 1e-4
  return Array.from({ length: BINS }, (_, at) => {
    const from = low + at * width
    const to = from + width
    const share = (values: number[]): number =>
      values.filter((value) => value >= from && (value < to || at === BINS - 1)).length /
      Math.max(1, values.length)
    return [
      from,
      to,
      ...returns.map(share),
      normalCdf((to - centre) / spread) - normalCdf((from - centre) / spread)
    ]
  })
}

/** Value at risk and expected shortfall from the fund's daily returns: losses, as positives. */
export function riskFigures(id: string, lines: Lines): Record<string, number> | undefined {
  if (id !== 'value_at_risk' && id !== 'expected_shortfall') return undefined
  const returns = [...(factorReturns(lines).get('fund') ?? [])].sort((one, other) => one - other)
  const centre = mean(returns)
  const spread = deviation(returns)
  const out: Record<string, number> = {}
  for (const [level, z] of [
    ['0.95', 1.6449],
    ['0.99', 2.3263]
  ] as const) {
    const cut = Math.max(1, Math.floor(returns.length * (1 - Number(level))))
    const tail = returns.slice(0, cut)
    const historical =
      id === 'value_at_risk' ? -(returns[cut - 1] ?? 0) : -mean(tail.length > 0 ? tail : [0])
    const density = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI)
    const normal =
      id === 'value_at_risk'
        ? z * spread - centre
        : (spread * density) / (1 - Number(level)) - centre
    const methods: [string, number][] = [
      ['historical', historical],
      ['normal', normal]
    ]
    if (id === 'value_at_risk') methods.push(['cornish_fisher', normal * 1.06])
    for (const [method, value] of methods) {
      out[`${method}/${level}/1`] = value
      out[`${method}/${level}/10`] = value * Math.sqrt(10)
    }
  }
  return out
}

/** py-beacon's named crises (d817ec8): the S&P 500's closing peak to closing trough. */
const NAMED_CRISES: [string, string, string][] = [
  ['Dot-com bust', '2000-03-24', '2002-10-09'],
  ['Global financial crisis', '2007-10-09', '2009-03-09'],
  ['European debt crisis', '2011-04-29', '2011-10-03'],
  ['China and oil, 2015-16', '2015-05-21', '2016-02-11'],
  ['Late-2018 sell-off', '2018-09-20', '2018-12-24'],
  ['Covid crash', '2020-02-19', '2020-03-23'],
  ['2022 inflation bear market', '2022-01-03', '2022-10-12'],
  ['2025 tariff shock', '2025-02-19', '2025-04-08']
]

interface Window {
  name: string
  start: string
  end: string
  status: string
  /** The run's first and last day in the crisis, as positions in its lines. */
  from: number
  to: number
}

function windowsOf(lines: Lines): Window[] {
  const dates = lines.strategy.index.map(day)
  const runStart = dates[0] ?? ''
  const runEnd = dates.at(-1) ?? ''
  return NAMED_CRISES.map(([name, start, end]) => {
    const status =
      end < runStart
        ? 'before_run'
        : start > runEnd
          ? 'after_run'
          : start < runStart || end > runEnd
            ? 'partial'
            : 'covered'
    const from = dates.findIndex((date) => date >= start)
    const after = dates.findIndex((date) => date > end)
    return { name, start, end, status, from, to: after === -1 ? dates.length - 1 : after - 1 }
  })
}

const seen = (window: Window): boolean => window.status === 'covered' || window.status === 'partial'

function worstFall(values: readonly number[]): number {
  let peak = -Infinity
  let worst = 0
  for (const value of values) {
    peak = Math.max(peak, value)
    worst = Math.min(worst, value / peak - 1)
  }
  return worst
}

/** Trading days from the crisis's end until the fund is back at its value on the first day. */
function recoveryOf(line: Line, window: Window): [number, string] | [null, null] {
  const start = line.data[window.from] ?? 0
  for (let at = window.to; at < line.data.length; at += 1) {
    if ((line.data[at] ?? 0) >= start) return [at - window.to, day(line.index[at])]
  }
  return [null, null]
}

function crisisRows(lines: Lines): Cell[][] {
  return windowsOf(lines).map((window) => {
    if (!seen(window)) return [window.name, window.start, window.end, ...nulls(10), window.status]
    const slice = (line: Line): number[] => line.data.slice(window.from, window.to + 1)
    const fund = slice(lines.strategy)
    const index = slice(lines.index)
    const total = (values: number[]): number => (values.at(-1) ?? 1) / (values[0] ?? 1) - 1
    const [days, date] = recoveryOf(lines.strategy, window)
    return [
      window.name,
      window.start,
      window.end,
      fund.length,
      total(fund),
      total(index),
      total(fund) - total(index),
      worstFall(fund),
      worstFall(index),
      0.8,
      0.004,
      days,
      date,
      window.status
    ]
  })
}

const nulls = (count: number): null[] => Array.from({ length: count }, () => null)

/** After the crisis: three months at least, on to a month past the fund's recovery, eighteen at most. */
const AFTER = { least: 63, past: 21, most: 378 }

function pathRows(lines: Lines): Cell[][] {
  const rows: Cell[][] = []
  for (const window of windowsOf(lines).filter(seen)) {
    const [days] = recoveryOf(lines.strategy, window)
    const after = Math.min(AFTER.most, Math.max(AFTER.least, (days ?? AFTER.most) + AFTER.past))
    const stop = Math.min(lines.strategy.data.length - 1, window.to + after)
    for (const [book, line] of books(lines)) {
      const base = line.data[window.from] ?? 1
      for (let at = window.from; at <= stop; at += 1) {
        rows.push([
          window.name,
          day(line.index[at]),
          book,
          (100 * (line.data[at] ?? base)) / base,
          at <= window.to ? 'crisis' : 'after'
        ])
      }
    }
  }
  return rows
}

/**
 * The market series the store will hold as ordinary names (py-beacon's
 * suggestion, 2026-11-21): ETF stand-ins, each the index's daily moves scaled
 * by its beta plus noise of its own.
 */
/** Each: its code, its name, its beta to the market before and after the turn, its own noise. */
export const MARKETS: [string, string, number, number, number][] = [
  ['ACWI', 'Global equity', 0.95, 0.95, 0.003],
  ['SPY', 'US equity', 1, 1, 0.002],
  ['EEM', 'Emerging markets', 0.8, 0.8, 0.008],
  ['AGG', 'US bonds', -0.1, 0.25, 0.003],
  ['TLT', 'Long Treasuries', -0.3, 0.2, 0.008],
  ['GLD', 'Gold', 0.05, 0.05, 0.009],
  ['UUP', 'US dollar', -0.15, -0.15, 0.004]
]

function correlation(one: readonly number[], other: readonly number[]): number {
  const left = mean(one)
  const right = mean(other)
  const covariance = mean(one.map((value, at) => (value - left) * ((other[at] ?? right) - right)))
  return covariance / (deviation(one) * deviation(other) || 1)
}

function seriesOf(lines: Lines): [string, number[]][] {
  return [...factorReturns(lines)]
}

function matrixRows(lines: Lines): Cell[][] {
  const series = seriesOf(lines)
  return series.map(([code, returns]) => [
    code,
    ...series.map(([, other]) => correlation(returns, other))
  ])
}

/** Each series' lowest, highest and latest volatility over a trailing year, a point a week. */
function volatilityRows(lines: Lines): Cell[][] {
  const window = 252
  return seriesOf(lines).map(([code, returns]) => {
    const points: number[] = []
    for (let end = window; end <= returns.length; end += 5) {
      points.push(deviation(returns.slice(end - window, end)) * Math.sqrt(252))
    }
    return [code, Math.min(...points), Math.max(...points), points.at(-1) ?? null]
  })
}

/** The fund against each series over a trailing year, a point a week. */
function rollingRows(lines: Lines): Cell[][] {
  const fund = seriesOf(lines)[0]?.[1] ?? []
  const others = seriesOf(lines).slice(1)
  const window = 252
  const rows: Cell[][] = []
  for (let end = window; end <= fund.length; end += 5) {
    rows.push([
      day(lines.strategy.index[end]),
      ...others.map(([, returns]) =>
        correlation(fund.slice(end - window, end), returns.slice(end - window, end))
      )
    ])
  }
  return rows
}

/** The series codes the correlation tables carry, in their column order. */
export function correlationCodes(benchmarked: boolean): string[] {
  return ['fund', 'index', ...(benchmarked ? ['benchmark'] : []), ...MARKETS.map(([code]) => code)]
}

export function riskTable(id: string, lines: Lines, run: string): RiskAnswer | undefined {
  if (id === 'member_risk_return') {
    const rows = memberRows(lines, run)
    return { rows, summary: { measured: rows.length, too_short: TOO_SHORT } }
  }
  if (id === 'portfolio_risk_return')
    return { rows: books(lines).map(([book, line]) => [book, ...measured(line)]) }
  if (id === 'efficient_frontier') {
    const { first, last, returns } = weekly(lines.strategy)
    return {
      rows: frontierRows(lines),
      summary: { names: LATEST, periods: returns.length, first, last }
    }
  }
  if (id === 'return_distribution') return { rows: distributionRows(lines) }
  if (id === 'crisis_returns') return { rows: crisisRows(lines) }
  if (id === 'crisis_paths') return { rows: pathRows(lines) }
  if (id === 'market_correlations') return { rows: matrixRows(lines) }
  if (id === 'rolling_correlations') return { rows: rollingRows(lines) }
  if (id === 'market_volatility') return { rows: volatilityRows(lines) }
  return undefined
}
