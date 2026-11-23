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

/** The standard normal's distribution function (Abramowitz and Stegun 7.1.26). */
function normal(z: number): number {
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const erf = 1 - poly * Math.exp(-x * x)
  return z < 0 ? (1 - erf) / 2 : (1 + erf) / 2
}

/** The chance the true Sharpe ratio is above nothing, given the sample's skew and tails. */
function probabilisticSharpe(daily: readonly number[]): number | null {
  const spread = deviation(daily)
  if (daily.length < 3 || spread === 0) return null
  const centre = mean(daily)
  const sharpe = centre / spread
  const skew = mean(daily.map((value) => ((value - centre) / spread) ** 3))
  const kurtosis = mean(daily.map((value) => ((value - centre) / spread) ** 4))
  const denominator = 1 - skew * sharpe + ((kurtosis - 1) / 4) * sharpe ** 2
  return denominator <= 0
    ? null
    : normal((sharpe * Math.sqrt(daily.length - 1)) / Math.sqrt(denominator))
}

/**
 * The figures Performance asks py-beacon for by period (Karan, 2026-11-23),
 * which no schema carries yet: names and definitions are the stub's guess.
 */
function requestedOf(line: Line, growth: number): Record<string, number | null> {
  const daily = returnsOf(line.data)
  const gains = daily.filter((value) => value > 0)
  const losses = daily.filter((value) => value < 0)
  const downside = Math.sqrt(mean(daily.map((value) => Math.min(value, 0) ** 2))) * Math.sqrt(YEAR)
  const drawdown = maxDrawdown(line.data)
  const psr = probabilisticSharpe(daily)
  return {
    best_day: daily.length === 0 ? null : round(Math.max(...daily)),
    worst_day: daily.length === 0 ? null : round(Math.min(...daily)),
    average_gain: gains.length === 0 ? null : round(mean(gains)),
    average_loss: losses.length === 0 ? null : round(mean(losses)),
    sortino_ratio: downside === 0 ? null : round(growth / downside),
    calmar_ratio: drawdown === 0 ? null : round(growth / -drawdown),
    probabilistic_sharpe_ratio: psr === null ? null : round(psr)
  }
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
    hit_rate_monthly: hit === null ? null : round(hit),
    ...requestedOf(line, growth)
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
  const slope = deviation(b) === 0 ? null : covariance / deviation(b) ** 2
  // What the comparator does not explain: the regression's alpha and residuals.
  const residuals = slope === null ? [] : a.map((value, at) => value - slope * (b[at] ?? 0))
  const residualSpread = deviation(residuals)
  const alpha = mean(residuals)
  return {
    relative_return: round(total(mine.data) - total(theirs.data)),
    annualised_relative_return: round(annualisedRelative),
    tracking_error: a.length < 2 ? null : round(trackingError),
    information_ratio: trackingError < 1e-9 ? null : round(annualisedRelative / trackingError),
    correlation: spread === 0 ? null : round(covariance / spread),
    beta: deviation(b) === 0 ? null : round(covariance / deviation(b) ** 2),
    hit_rate_monthly: share(months.map((value, at) => value > (theirMonths[at] ?? 0))),
    // Requested by Performance (Karan, 2026-11-23); the stub's guess, as requestedOf's.
    alpha: slope === null ? null : round(alpha * YEAR),
    alpha_t_stat:
      residualSpread === 0 ? null : round(alpha / (residualSpread / Math.sqrt(residuals.length))),
    r_squared: spread === 0 ? null : round((covariance / spread) ** 2),
    residual_risk: slope === null ? null : round(residualSpread * Math.sqrt(YEAR)),
    treynor_ratio: slope === null || slope === 0 ? null : round(annualised(mine.data) / slope),
    information_ratio_t_stat:
      trackingError < 1e-9
        ? null
        : round((annualisedRelative / trackingError) * Math.sqrt(a.length / YEAR))
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

/** A period's name, and how it cuts any line down to its days. */
interface Window {
  label: string
  of: (line: Line) => Line
}

function calendarWindows(strategy: Line, frequency: string): Window[] {
  const buckets = [...new Set(strategy.index.map((date) => bucketOf(date, frequency)))]
  return buckets.map((bucket) => ({ label: bucket, of: (line) => slice(line, bucket, frequency) }))
}

/** Months back from the last day; YTD runs from the close of the year before. */
const TRAILING: readonly (readonly [string, number | 'ytd'])[] = [
  ['1M', 1],
  ['3M', 3],
  ['6M', 6],
  ['YTD', 'ytd'],
  ['1Y', 12],
  ['3Y', 36],
  ['5Y', 60]
]

/**
 * Windows ending on the run's last day, the shortest first (Karan,
 * 2026-11-23): the stub's guess at `frequency=trailing`, asked of py-beacon.
 * A window longer than the run's history is left out rather than cut short.
 */
function trailingWindows(strategy: Line): Window[] {
  const first = (strategy.index[0] ?? '').slice(0, 10)
  const last = (strategy.index[strategy.index.length - 1] ?? '').slice(0, 10)
  return TRAILING.flatMap(([label, back]) => {
    const cutoff =
      back === 'ytd' ? `${String(Number(last.slice(0, 4)) - 1)}-12-31` : monthsBefore(last, back)
    if (cutoff < first) return []
    return [{ label, of: (line: Line) => from(line, cutoff) }]
  })
}

function monthsBefore(date: string, months: number): string {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCMonth(day.getUTCMonth() - months)
  return day.toISOString().slice(0, 10)
}

/** A line from its last close on or before the cutoff. */
function from(line: Line, cutoff: string): Line {
  let at = 0
  line.index.forEach((date, i) => {
    if (date.slice(0, 10) <= cutoff) at = i
  })
  return { index: line.index.slice(at), data: line.data.slice(at) }
}

/** GET /strategies/{id}/periods: PeriodRow per period, oldest (or shortest) first. */
export function periodsOf(
  strategy: Line,
  comparators: { index: Line | undefined; benchmark: Line | undefined },
  frequency: string
): unknown[] {
  const windows =
    frequency === 'trailing' ? trailingWindows(strategy) : calendarWindows(strategy, frequency)
  return windows.map((window) => {
    const mine = window.of(strategy)
    const against = (line: Line | undefined): unknown => {
      if (line === undefined) return null
      const theirs = window.of(line)
      return { own: figuresOf(theirs), relative: relativeOf(mine, theirs) }
    }
    const own = figuresOf(mine)
    return {
      period: window.label,
      start: (mine.index[0] ?? '').slice(0, 10),
      end: (mine.index[mine.index.length - 1] ?? '').slice(0, 10),
      strategy: {
        total_return: own.total_return,
        volatility: own.volatility,
        sharpe_ratio: own.sharpe_ratio,
        max_drawdown: own.max_drawdown,
        positive_days: round(share(returnsOf(mine.data).map((value) => value > 0)) ?? 0),
        best_day: own.best_day,
        worst_day: own.worst_day,
        average_gain: own.average_gain,
        average_loss: own.average_loss,
        sortino_ratio: own.sortino_ratio,
        probabilistic_sharpe_ratio: own.probabilistic_sharpe_ratio
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
