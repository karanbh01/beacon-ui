/**
 * The figures py-beacon 0.9.2 reports for a run, worked out the way it
 * works them out (BN-323, BN-324), so the stub's numbers agree with each
 * other the way the engine's do.
 *
 * Fractions throughout, as the engine sends them: 0.0523 is 5.23%. A year is
 * 252 returns; Sharpe is annualised return over volatility at a zero rate;
 * the information ratio is annualised relative return over tracking error;
 * a period runs from the previous period's close, the first from the start.
 */

export interface Line {
  index: string[]
  data: number[]
}

const YEAR = 252

function returnsOf(data: readonly number[]): number[] {
  return data.slice(1).map((value, at) => value / (data[at] ?? value) - 1)
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length)
}

function deviation(values: readonly number[]): number {
  if (values.length < 2) return 0
  const centre = mean(values)
  return Math.sqrt(
    values.reduce((total, value) => total + (value - centre) ** 2, 0) / (values.length - 1)
  )
}

function round(value: number): number {
  return Number(value.toFixed(6))
}

function total(data: readonly number[]): number {
  return (data[data.length - 1] ?? 1) / (data[0] ?? 1) - 1
}

function annualised(data: readonly number[]): number {
  const years = (data.length - 1) / YEAR
  return years > 0 ? (1 + total(data)) ** (1 / years) - 1 : 0
}

function volatility(data: readonly number[]): number {
  return deviation(returnsOf(data)) * Math.sqrt(YEAR)
}

function maxDrawdown(data: readonly number[]): number {
  let peak = -Infinity
  let worst = 0
  for (const value of data) {
    peak = Math.max(peak, value)
    worst = Math.min(worst, value / peak - 1)
  }
  return worst
}

/** Month-end closes, the first month opened by the line's first value. */
function monthlyReturns(line: Line): number[] {
  const closes = new Map<string, number>()
  line.index.forEach((date, at) => closes.set(date.slice(0, 7), line.data[at] ?? 0))
  const ends = [line.data[0] ?? 1, ...closes.values()]
  return returnsOf(ends)
}

function share(values: readonly boolean[]): number | null {
  return values.length === 0 ? null : values.filter(Boolean).length / values.length
}

/** A line's own figures, as BacktestMetrics and ComparatorFigures define them. */
export function figuresOf(line: Line): Record<string, number | null> {
  const growth = annualised(line.data)
  const risk = volatility(line.data)
  const hit = share(monthlyReturns(line).map((value) => value > 0))
  return {
    total_return: round(total(line.data)),
    annualised_return: round(growth),
    volatility: round(risk),
    sharpe_ratio: round(risk === 0 ? 0 : growth / risk),
    max_drawdown: round(maxDrawdown(line.data)),
    hit_rate_monthly: hit === null ? null : round(hit)
  }
}

/** The two lines on the dates both have. */
function shared(left: Line, right: Line): [Line, Line] {
  const theirs = new Map(right.index.map((date, at) => [date, right.data[at] ?? 0]))
  const dates = left.index.filter((date) => theirs.has(date))
  const mine = new Map(left.index.map((date, at) => [date, left.data[at] ?? 0]))
  return [
    { index: dates, data: dates.map((date) => mine.get(date) ?? 0) },
    { index: dates, data: dates.map((date) => theirs.get(date) ?? 0) }
  ]
}

/** The strategy against one comparator: RelativeFigures. */
export function relativeOf(strategy: Line, comparator: Line): Record<string, number | null> {
  const [mine, theirs] = shared(strategy, comparator)
  const a = returnsOf(mine.data)
  const b = returnsOf(theirs.data)
  const active = a.map((value, at) => value - (b[at] ?? 0))
  const trackingError = deviation(active) * Math.sqrt(YEAR)
  const annualisedRelative = annualised(mine.data) - annualised(theirs.data)
  const [ma, mb] = [mean(a), mean(b)]
  // On n − 1, as the deviations are, so a line against itself correlates at 1.
  const covariance =
    a.reduce((sum, value, at) => sum + (value - ma) * ((b[at] ?? 0) - mb), 0) /
    Math.max(1, a.length - 1)
  const spread = deviation(a) * deviation(b)
  const months = monthlyReturns(mine)
  const theirMonths = monthlyReturns(theirs)
  return {
    relative_return: round(total(mine.data) - total(theirs.data)),
    annualised_relative_return: round(annualisedRelative),
    tracking_error: a.length < 2 ? null : round(trackingError),
    information_ratio: trackingError < 1e-9 ? null : round(annualisedRelative / trackingError),
    correlation: spread === 0 ? null : round(covariance / spread),
    beta: deviation(b) === 0 ? null : round(covariance / deviation(b) ** 2),
    hit_rate_monthly: share(months.map((value, at) => value > (theirMonths[at] ?? 0)))
  }
}

/** A ComparisonPayload: the comparator, its own figures, and the strategy against it. */
export function comparisonOf(
  id: string,
  kind: 'index' | 'identifier',
  strategy: Line,
  comparator: Line
): unknown {
  const [, theirs] = shared(strategy, comparator)
  const first = theirs.data[0] ?? 1
  return {
    id,
    kind,
    start: (theirs.index[0] ?? '').slice(0, 10),
    end: (theirs.index[theirs.index.length - 1] ?? '').slice(0, 10),
    observations: theirs.index.length,
    level: {
      name: id,
      index: theirs.index,
      data: theirs.data.map((value) => round((value / first) * 100))
    },
    own: figuresOf(theirs),
    relative: relativeOf(strategy, comparator)
  }
}

function bucketOf(date: string, frequency: string): string {
  if (frequency === 'annual') return date.slice(0, 4)
  if (frequency === 'monthly') return date.slice(0, 7)
  return `${date.slice(0, 4)} Q${String(Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1)}`
}

/** A period's slice: opened by the previous period's close, the first by the start. */
function slice(line: Line, bucket: string, frequency: string): Line {
  const at = line.index.findIndex((date) => bucketOf(date, frequency) === bucket)
  if (at === -1) return { index: [], data: [] }
  const inside = line.index.flatMap((date, i) => (bucketOf(date, frequency) === bucket ? [i] : []))
  const from = at > 0 ? [at - 1, ...inside] : inside
  return {
    index: from.map((i) => line.index[i] ?? ''),
    data: from.map((i) => line.data[i] ?? 0)
  }
}

/** GET /strategies/{id}/periods: PeriodRow per period, oldest first. */
export function periodsOf(
  strategy: Line,
  comparators: { index: Line | undefined; benchmark: Line | undefined },
  frequency: string
): unknown[] {
  const buckets = [...new Set(strategy.index.map((date) => bucketOf(date, frequency)))]
  return buckets.map((bucket) => {
    const mine = slice(strategy, bucket, frequency)
    const against = (line: Line | undefined): unknown => {
      if (line === undefined) return null
      const theirs = slice(line, bucket, frequency)
      return { own: figuresOf(theirs), relative: relativeOf(mine, theirs) }
    }
    const own = figuresOf(mine)
    return {
      period: bucket,
      start: (mine.index[0] ?? '').slice(0, 10),
      end: (mine.index[mine.index.length - 1] ?? '').slice(0, 10),
      strategy: {
        total_return: own.total_return,
        volatility: own.volatility,
        sharpe_ratio: own.sharpe_ratio,
        max_drawdown: own.max_drawdown,
        positive_days: round(share(returnsOf(mine.data).map((value) => value > 0)) ?? 0)
      },
      index: against(comparators.index),
      benchmark: against(comparators.benchmark)
    }
  })
}

/** A run's drawdown series: the line against its running peak, 0 at a new high. */
export function drawdownOf(line: Line): Line {
  let peak = -Infinity
  return {
    index: line.index,
    data: line.data.map((value) => {
      peak = Math.max(peak, value)
      return round(value / peak - 1)
    })
  }
}
