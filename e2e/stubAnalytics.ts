import {
  CATALOGUE_NAMES,
  CATALOGUE_REPORTS,
  CATALOGUE_STATISTICS,
  CATALOGUE_UNAVAILABLE,
  type StubStatistic
} from './stubAnalyticsCatalogue'
import { riskFigures, riskStatisticTable, riskTable } from './stubRisk'

/**
 * py-beacon 0.10.0's analytics as the stub answers them (BN-398, BN-400):
 * the catalogue, a run's `analytics` block, and its large tables in the
 * by-column JSON. The headline figures are worked out from the stub's own
 * level series, so they agree with its charts; the rest are steady,
 * plausible numbers seeded by strategy and statistic, which is all a design
 * review needs of them.
 */

export interface Line {
  index: string[]
  data: number[]
}
export interface Lines {
  strategy: Line
  index: Line
  benchmark: Line | undefined
}

export function analysisOptions(): unknown {
  return {
    settings: [
      {
        name: 'window',
        label: 'Window',
        order: 1,
        parameters: [
          {
            name: 'risk_free_rate',
            type: 'number',
            required: false,
            default: 0,
            label: 'Risk-free rate',
            order: 1,
            unit: 'fraction',
            minimum: 0,
            help: 'The annual rate excess returns are measured over.'
          },
          {
            name: 'tracked',
            type: 'string',
            required: false,
            default: 'index',
            label: 'Compared with',
            order: 2,
            choices: ['index', 'benchmark'],
            choice_labels: { index: 'The index', benchmark: 'The benchmark' },
            help: 'What relative figures and Active are measured against.'
          }
        ]
      },
      {
        name: 'rolling',
        label: 'Rolling figures',
        order: 2,
        parameters: [
          {
            name: 'window',
            type: 'integer',
            required: false,
            default: 252,
            label: 'Window',
            order: 1,
            unit: 'days',
            suggestions: [63, 126, 252, 756, 1260],
            help: 'How many trading days each rolling figure looks back over.'
          },
          {
            name: 'step',
            type: 'string',
            required: false,
            default: 'daily',
            label: 'Step',
            order: 2,
            choices: ['daily', 'month_end'],
            choice_labels: { daily: 'Daily', month_end: 'Month end' },
            help: 'How often a rolling figure is worked out.'
          }
        ]
      },
      {
        name: 'value_at_risk',
        label: 'Value at risk',
        order: 3,
        parameters: [
          {
            name: 'methods',
            type: 'array',
            required: false,
            default: ['historical', 'normal'],
            label: 'Methods',
            order: 1,
            items: {
              type: 'string',
              choices: ['historical', 'normal', 'cornish_fisher'],
              choice_labels: CATALOGUE_NAMES.method
            },
            help: 'How VaR and expected shortfall are estimated.'
          },
          {
            name: 'confidence',
            type: 'array',
            required: false,
            default: [0.95, 0.99],
            label: 'Confidence levels',
            order: 2,
            items: { type: 'number', unit: 'fraction', choices: [0.9, 0.95, 0.975, 0.99] },
            help: 'Each level VaR and expected shortfall are given at.'
          }
        ]
      }
    ],
    // `relative` is the stub's own note of how it works a figure out, not the catalogue's.
    statistics: CATALOGUE_STATISTICS.map((entry) => {
      const statistic: Partial<typeof entry> = { ...entry }
      delete statistic.relative
      return {
        ...statistic,
        settings: statistic.rolling === null ? [] : ['rolling.window', 'rolling.step']
      }
    }),
    reports: CATALOGUE_REPORTS,
    names: CATALOGUE_NAMES,
    tables: [{ name: 'trades', label: 'Trades', columns: TRADE_COLUMNS }],
    unavailable: CATALOGUE_UNAVAILABLE,
    renamed: {},
    // py-beacon 0.11.0: the summary statistic table took trailing_statistics'
    // place (482061e), and GET /instrument member_risk_return's (42702d4).
    dropped: ['trailing_statistics', 'member_risk_return']
  }
}

/** A steady number in [0, 1) from a text, so a figure is the same on every read. */
function noise(text: string): number {
  let hash = 2166136261
  for (let at = 0; at < text.length; at += 1) {
    hash ^= text.charCodeAt(at)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 100000) / 100000
}

const between = (key: string, low: number, high: number): number => low + noise(key) * (high - low)

function returnsOf(line: Line): number[] {
  return line.data.slice(1).map((value, at) => value / (line.data[at] ?? value) - 1)
}

const mean = (values: number[]): number =>
  values.reduce((total, value) => total + value, 0) / Math.max(1, values.length)
const deviation = (values: number[]): number => {
  const centre = mean(values)
  return Math.sqrt(mean(values.map((value) => (value - centre) ** 2)))
}

/** The headline figures of one line, and of one line against another. */
function own(line: Line): Record<string, number> {
  const returns = returnsOf(line)
  const total = (line.data[line.data.length - 1] ?? 100) / (line.data[0] ?? 100) - 1
  const years = Math.max(returns.length / 252, 1 / 252)
  const cagr = (1 + total) ** (1 / years) - 1
  const volatility = deviation(returns) * Math.sqrt(252)
  let peak = -Infinity
  let worst = 0
  for (const value of line.data) {
    peak = Math.max(peak, value)
    worst = Math.min(worst, value / peak - 1)
  }
  const downside = Math.sqrt(mean(returns.map((value) => Math.min(value, 0) ** 2))) * Math.sqrt(252)
  return {
    total_return: total,
    annualised_return: cagr,
    volatility,
    max_drawdown: worst,
    // py-beacon's Sharpe (BN-405): the mean daily return over its deviation, scaled by √252,
    // so it holds over a month. The stub takes the risk-free rate as nil.
    sharpe_ratio: volatility === 0 ? 0 : (mean(returns) / deviation(returns)) * Math.sqrt(252),
    sortino_ratio: downside === 0 ? 0 : cagr / downside,
    calmar_ratio: worst === 0 ? 0 : cagr / -worst,
    downside_deviation: downside,
    share_positive: mean(returns.map((value) => (value > 0 ? 1 : 0)))
  }
}

function against(line: Line, comparator: Line): Record<string, number> {
  const mine = returnsOf(line)
  const theirs = returnsOf(comparator)
  const active = mine.map((value, at) => value - (theirs[at] ?? 0))
  const te = deviation(active) * Math.sqrt(252)
  const covariance = mean(
    mine.map((value, at) => (value - mean(mine)) * ((theirs[at] ?? 0) - mean(theirs)))
  )
  const correlation = covariance / (deviation(mine) * deviation(theirs) || 1)
  const beta = covariance / (deviation(theirs) ** 2 || 1)
  const ownFigures = own(line)
  const theirFigures = own(comparator)
  const relative = (ownFigures.annualised_return ?? 0) - (theirFigures.annualised_return ?? 0)
  return {
    tracking_difference: (ownFigures.total_return ?? 0) - (theirFigures.total_return ?? 0),
    tracking_error: te,
    information_ratio: te === 0 ? 0 : relative / te,
    relative_return: relative,
    beta,
    correlation,
    r_squared: correlation ** 2,
    residual_risk: te * Math.sqrt(Math.max(0, 1 - correlation ** 2)),
    batting_average: mean(active.map((value) => (value > 0 ? 1 : 0)))
  }
}

/** A plausible figure for a statistic not worked out above, by its unit. */
function guess(statistic: StubStatistic, key: string): number {
  if (statistic.unit === 'fraction') return between(key, -0.05, 0.25)
  if (statistic.unit === 'money') return Math.round(between(key, 1e4, 4e6))
  if (statistic.unit === 'bps') return between(key, 1, 30)
  if (statistic.unit === 'count') return Math.round(between(key, 8, 60))
  return between(key, 0.2, 1.8)
}

const NO_FUTURES = ['futures_trading', 'futures_basis', 'futures_basis_risk']

/** Why a statistic cannot be worked out for this run, if it cannot. */
function unavailableOf(id: string): { code: string; reason: string } | undefined {
  if (id === 'etf_premium')
    return {
      code: 'no_quotes',
      reason: 'The run has no exchange quotes: it was not run as an ETF.'
    }
  if (NO_FUTURES.includes(id))
    return { code: 'no_futures', reason: 'The run held no index futures.' }
  if (id === 'costs_by_class')
    return { code: 'no_share_classes', reason: 'The run had a single share class.' }
  return undefined
}

function figuresOf(statistic: StubStatistic, run: string, lines: Lines): Record<string, number> {
  const books: [string, Line | undefined][] = [
    ['fund', lines.strategy],
    ['index', lines.index],
    ['benchmark', lines.benchmark]
  ]
  if (statistic.relative === true) {
    const figure =
      against(lines.strategy, lines.index)[statistic.id] ??
      guess(statistic, `${run}/${statistic.id}`)
    return { active: figure }
  }
  const risk = riskFigures(statistic.id, lines)
  if (risk !== undefined) return risk
  if (statistic.figure_names !== undefined) {
    const out: Record<string, number> = {}
    if (statistic.id === 'factor_betas') {
      for (const factor of ['SIZE', 'VALUE', 'MOMENTUM'])
        out[factor] = between(`${run}/${factor}`, -0.4, 1.1)
      return out
    }
    for (const method of ['historical', 'normal']) {
      for (const confidence of ['0.95', '0.99']) {
        const base = confidence === '0.99' ? 0.032 : 0.021
        out[`${method}/${confidence}/1`] =
          -(base * between(`${run}/${statistic.id}/${method}`, 0.85, 1.25)) *
          (statistic.id === 'expected_shortfall' ? 1.3 : 1)
      }
    }
    return out
  }
  const out: Record<string, number> = {}
  for (const [book, line] of books) {
    if (line === undefined) continue
    out[book] = own(line)[statistic.id] ?? guess(statistic, `${run}/${statistic.id}/${book}`)
  }
  if (statistic.category === 'Returns' && out.fund !== undefined && out.index !== undefined) {
    out.active = out.fund - out.index
  }
  if (statistic.part === 'portfolio' && statistic.unit !== 'fraction')
    return { fund: out.fund ?? 0 }
  return out
}

/** A rolling figure: a trailing year of the line, sampled each fortnight to keep the payload small. */
function rollingOf(statistic: StubStatistic, lines: Lines, point: Record<string, number>): unknown {
  const window = 252
  const index: string[] = []
  const data: number[][] = []
  const columns = Object.keys(point)
  const slice = (line: Line, end: number): Line => ({
    index: line.index.slice(end - window, end),
    data: line.data.slice(end - window, end)
  })
  for (let end = window; end <= lines.strategy.data.length; end += 10) {
    index.push((lines.strategy.index[end - 1] ?? '').slice(0, 10))
    data.push(
      columns.map((column) => {
        if (statistic.relative === true)
          return against(slice(lines.strategy, end), slice(lines.index, end))[statistic.id] ?? 0
        const line =
          column === 'index'
            ? lines.index
            : column === 'benchmark'
              ? lines.benchmark
              : lines.strategy
        if (line === undefined) return 0
        return own(slice(line, end))[statistic.id] ?? point[column] ?? 0
      })
    )
  }
  return { window, step: 'daily', table: { index, columns, data } }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const SECTORS = ['Technology', 'Health care', 'Financials', 'Industrials', 'Consumer', 'Energy']
const FACTORS = ['Size', 'Value', 'Momentum']
const NAMES = Array.from({ length: 10 }, (_, at) => `CMP${String(at).padStart(3, '0')}`)

/** The first column's rows for each table statistic. */
function rowsOf(id: string, years: string[]): string[] {
  const rows: Record<string, string[]> = {
    trailing_returns: ['1M', '3M', '6M', 'YTD', '1Y', '3Y'],
    period_returns: years,
    td_by_year: years,
    best_worst_periods: ['Best month', 'Worst month', 'Best quarter', 'Worst quarter'],
    average_gain_loss: ['Average gain', 'Average loss'],
    streaks: ['Longest rising', 'Longest falling'],
    mean_returns: ['Arithmetic', 'Geometric'],
    month_of_year: MONTHS,
    return_histogram: ['< -6%', '-6 to -3%', '-3 to 0%', '0 to 3%', '3 to 6%', '> 6%'],
    bootstrap_ranges: ['Annual return', 'Volatility', 'Max drawdown'],
    alpha: ['Alpha', 't-stat'],
    capture: ['Up capture', 'Down capture'],
    rolling_outcomes: ['1 year', '3 years'],
    crisis_returns: ['Covid crash 2020', 'Rate shock 2022', 'Banking stress 2023'],
    crisis_summary: ['Average crisis return', 'Worst crisis return'],
    regime_figures: ['Rising market', 'Falling market', 'High volatility'],
    group_weights: SECTORS,
    characteristics: ['Price to earnings', 'Price to book', 'Dividend yield', 'Market cap (bn)'],
    trade_counts: ['Trades', 'Buys', 'Sells', 'Mean trade'],
    costs_by_kind: ['Commission', 'Spread', 'Market impact', 'Taxes'],
    cash_trading: ['Rebalance', 'Dividend reinvestment', 'Cash band', 'Flows'],
    aum_units: ['AUM', 'Units in issue'],
    factor_exposures: FACTORS,
    factor_returns: FACTORS,
    factor_attribution: FACTORS,
    stress_windows: ['Covid crash 2020', 'Rate shock 2022'],
    expected_risk: ['Volatility', 'Tracking error'],
    herfindahl: ['Herfindahl', 'Effective number'],
    top_weights: ['Top 5', 'Top 10'],
    concentration_curve: ['1', '3', '5', '10'],
    gini_entropy: ['Gini', 'Entropy'],
    concentration_by_risk: ['Top 3', 'Top 5'],
    concentration_by_outcome: ['Top 3', 'Top 5'],
    days_to_sell: ['Days to sell 95%', 'Sellable in a day'],
    brinson_fachler: SECTORS,
    currency_attribution: ['USD', 'EUR', 'GBP'],
    implementation_breakdown: ['Costs', 'Cash drag', 'Capping', 'Timing'],
    cash_band_events: ['2025-03-31', '2025-09-30', '2026-03-31']
  }
  return rows[id] ?? NAMES
}

const SIGNED_CATEGORIES = ['Returns', 'Crises and regimes', 'Attribution']

/** Each calendar year's return of a line, and the year-to-date and trailing ones. */
function growth(line: Line, from: number, to: number): number {
  return (line.data[to] ?? 100) / (line.data[from] ?? 100) - 1
}

function yearly(line: Line, years: string[]): number[] {
  return years.map((year) => {
    const first = line.index.findIndex((date) => date.startsWith(year))
    const last =
      line.index.length - 1 - [...line.index].reverse().findIndex((date) => date.startsWith(year))
    return growth(line, Math.max(0, first - 1), last)
  })
}

function trailing(line: Line): number[] {
  const end = line.data.length - 1
  const back = (days: number): number => growth(line, Math.max(0, end - days), end)
  const year = (line.index[end] ?? '').slice(0, 4)
  const start = line.index.findIndex((date) => date.startsWith(year))
  return [
    back(21),
    back(63),
    back(126),
    growth(line, Math.max(0, start - 1), end),
    back(252),
    back(756)
  ]
}

/** The tables worked out from the lines, so they agree with the figures and the chart. */
function measuredTable(
  id: string,
  lines: Lines,
  years: string[],
  run: string
): (string | number | null)[][] | undefined {
  const books = (values: (line: Line) => number[]): number[][] => {
    const fund = values(lines.strategy)
    const index = values(lines.index)
    const benchmark = lines.benchmark === undefined ? [] : values(lines.benchmark)
    return fund.map((value, at) => [
      value,
      index[at] ?? 0,
      benchmark[at] ?? Number.NaN,
      value - (index[at] ?? 0)
    ])
  }
  if (id === 'period_returns')
    return books((line) => yearly(line, years)).map((row, at) => [years[at] ?? '', ...nan(row)])
  if (id === 'trailing_returns') {
    const labels = ['1M', '3M', '6M', 'YTD', '1Y', '3Y']
    return books(trailing).map((row, at) => [labels[at] ?? '', ...nan(row)])
  }
  if (id === 'risk_rating') return riskRating(lines, run)
  if (id === 'risk_distribution') return riskDistribution(lines, run)
  if (id === 'trade_counts') {
    const trades = tradesOf(lines)
    const buys = trades.filter((trade) => trade.side === 'buy').length
    const units = trades.reduce((total, trade) => total + trade.units, 0)
    return [
      ['Trades', trades.length],
      ['Buys', buys],
      ['Sells', trades.length - buys],
      ['Mean trade', Math.round(units / Math.max(1, trades.length))]
    ]
  }
  if (id === 'td_by_year') {
    return books((line) => yearly(line, years)).map((row, at) => [
      years[at] ?? '',
      row[0] ?? 0,
      row[1] ?? 0,
      row[3] ?? 0
    ])
  }
  return undefined
}

const SIZES = ['large', 'mid', 'small']
const STYLES = ['value', 'blend', 'growth']

interface Placed {
  name: string
  /** 0 at the top of large to 3 at the bottom of small. */
  size: number
  /** 0 at the deepest value to 3 at the most growth. */
  style: number
  fund: number
  index: number
  benchmark: number
}

type Book = 'fund' | 'index' | 'benchmark'

/**
 * Each name's place in the style box and its weight in each book: the
 * index's by size, the fund's leaning towards the cells the run's key
 * favours and holding most but not all of the index's names, and a
 * benchmark's leaning to value, as TECH10's EU-VALUE does.
 */
function stylePositions(run: string): Placed[] {
  const lean = between(`${run}/lean`, 0.4, 2.4)
  const names = Array.from({ length: 30 }, (_, at) => `CMP${String(at).padStart(3, '0')}`)
  const placed = names.map((name) => {
    const size = 3 * noise(`style/${name}/size`) ** 1.3
    const style = 3 * noise(`style/${name}/style`)
    const index = Math.exp(-0.9 * size)
    const held = noise(`${run}/${name}/held`) > 0.18
    const fund = held
      ? (index * between(`${run}/${name}/tilt`, 0.4, 1.6)) / (1 + Math.abs(style - lean))
      : 0
    const benchmark = Math.exp(-0.6 * size) / (1 + style)
    return { name, size, style, fund, index, benchmark }
  })
  const total = (book: Book): number => placed.reduce((sum, entry) => sum + entry[book], 0) || 1
  const fundTotal = total('fund')
  const indexTotal = total('index')
  const benchmarkTotal = total('benchmark')
  return placed.map((entry) => ({
    ...entry,
    fund: entry.fund / fundTotal,
    index: entry.index / indexTotal,
    benchmark: entry.benchmark / benchmarkTotal
  }))
}

const cellOf = (position: number): number => Math.min(2, Math.floor(position))

const GICS_SECTORS = [
  'Information technology',
  'Financials',
  'Health care',
  'Consumer discretionary',
  'Communication services',
  'Industrials',
  'Consumer staples',
  'Energy',
  'Utilities',
  'Real estate',
  'Materials'
]
const COUNTRIES = [
  'United States',
  'Japan',
  'United Kingdom',
  'Canada',
  'France',
  'Switzerland',
  'Germany',
  'Australia',
  'Netherlands',
  'Sweden',
  'Denmark',
  'Italy',
  'Spain',
  'Hong Kong',
  'Singapore',
  'Belgium'
]

/**
 * Each group's latest weight in the fund, the index and any benchmark,
 * heavier towards the top of the list as real sector and country weights
 * are, sorted by the index's weight as py-beacon sorts them. The fund's
 * weights are of its NAV, so its cash is a group of its own and each book
 * sums to one (py-beacon, 2026-11-20).
 */
function groupWeights(
  run: string,
  grouping: string,
  groups: string[],
  benchmarked: boolean
): (string | number | null)[][] {
  const book = (name: string): number[] => {
    const raw = groups.map(
      (group, at) => between(`${run}/${grouping}/${group}/${name}`, 0.4, 1.6) / (at + 1) ** 1.3
    )
    const total = raw.reduce((sum, value) => sum + value, 0)
    return raw.map((value) => value / total)
  }
  const cash = between(`${run}/cash`, 0.005, 0.03)
  const fund = book('fund').map((weight) => weight * (1 - cash))
  const index = book('index')
  const benchmark = book('benchmark')
  const held = groups
    .map((group, at) => [
      grouping,
      group,
      fund[at] ?? 0,
      index[at] ?? 0,
      benchmarked ? (benchmark[at] ?? 0) : null
    ])
    .sort((one, other) => Number(other[3]) - Number(one[3]))
  return [...held, [grouping, 'Cash', cash, 0, benchmarked ? 0 : null]]
}

/**
 * Each book's characteristics at each of three rebalances, the latest last,
 * as py-beacon lays them out (BN-425, BN-426): fund, index and benchmark,
 * each with market cap in whole units of the run's currency, the ratios in
 * times, and the yield and a year's earnings and sales growth as fractions.
 * A run without a benchmark has nulls in its columns.
 */
function characteristics(run: string, benchmarked: boolean): (number | null)[][] {
  const near = (key: string, low: number, high: number): number =>
    Math.round(between(`${run}/${key}`, low, high) * 100) / 100
  const books: [string, [number, number][]][] = [
    [
      'fund',
      [
        [90, 400],
        [16, 30],
        [2, 6],
        [0.8, 2.6],
        [4, 18],
        [3, 12]
      ]
    ],
    [
      'index',
      [
        [180, 260],
        [18, 24],
        [3, 4.5],
        [1.2, 1.8],
        [5, 12],
        [4, 9]
      ]
    ],
    [
      'benchmark',
      [
        [60, 120],
        [10, 15],
        [1.2, 2],
        [2.5, 4],
        [1, 6],
        [1, 5]
      ]
    ]
  ]
  const scale = [1e9, 1, 1, 0.01, 0.01, 0.01]
  return [0, 1, 2].map((rebalance) =>
    books.flatMap(([book, ranges]) =>
      ranges.map(([low, high], at) =>
        book === 'benchmark' && !benchmarked
          ? null
          : near(`${book}/${String(at)}/${String(rebalance)}`, low, high) * (scale[at] ?? 1)
      )
    )
  )
}

/** A book's weight in each of the nine cells, size by size. */
function cellWeights(run: string, book: Book): number[] {
  const cells = Array.from({ length: 9 }, () => 0)
  for (const entry of stylePositions(run)) {
    const at = cellOf(entry.size) * 3 + cellOf(entry.style)
    cells[at] = (cells[at] ?? 0) + entry[book]
  }
  return cells
}

/**
 * A book's weighted centre and the cell it falls in, as py-beacon works it
 * out: the placed names only, their weights rescaled to sum to one.
 */
function centreCell(run: string, book: Book): [string, string, number, number] {
  const placed = stylePositions(run).filter((entry) => entry[book] > 0)
  const total = placed.reduce((sum, entry) => sum + entry[book], 0) || 1
  let size = 0
  let style = 0
  for (const entry of placed) {
    size += (entry[book] / total) * entry.size
    style += (entry[book] / total) * entry.style
  }
  return [SIZES[cellOf(size)] ?? 'mid', STYLES[cellOf(style)] ?? 'blend', size, style]
}

/** The fewest and most names a run held, and the index's count. */
function holdingsSpan(run: string): [number, number, number] {
  const index = Math.round(between(`${run}/index-names`, 28, 32))
  const least = Math.round(between(`${run}/least`, 0.7, 0.8) * index)
  const most = Math.round(between(`${run}/most`, 0.9, 1) * index)
  return [least, most, index]
}

/** The provisional portfolio tables (BU-294): holdings over the run, and the style box. */
/**
 * The provisional portfolio tables. A benchmark's column is null for a run
 * without one, as py-beacon leaves a book it did not measure.
 */
function portfolioTable(
  id: string,
  run: string,
  benchmarked: boolean
): (string | number | null)[][] | undefined {
  const ifBenchmarked = (value: number): number | null => (benchmarked ? value : null)
  if (id === 'holdings_range') {
    const [least, most, index] = holdingsSpan(run)
    const latest = Math.round(between(`${run}/latest`, least, most))
    const benchmark = ifBenchmarked(40)
    return [
      ['least', least, index, benchmark],
      ['most', most, index, benchmark],
      ['latest', latest, index, benchmark]
    ]
  }
  if (id === 'holdings_distribution') {
    const [least, most] = holdingsSpan(run)
    const counts = Array.from({ length: most - least + 1 }, (_, at) => least + at)
    const raw = counts.map((count) => between(`${run}/days/${String(count)}`, 0.05, 1))
    const total = raw.reduce((sum, value) => sum + value, 0)
    return counts.map((count, at) => {
      const share = (raw[at] ?? 0) / total
      return [count, Math.round(share * 780), share]
    })
  }
  if (id === 'style_classification') {
    return [
      ['fund', ...centreCell(run, 'fund')],
      ['index', ...centreCell(run, 'index')],
      ...(benchmarked ? [['benchmark', ...centreCell(run, 'benchmark')]] : [])
    ]
  }
  if (id === 'characteristics') return characteristics(run, benchmarked)
  if (id === 'style_positions') {
    return stylePositions(run).map((entry) => [
      entry.name,
      entry.size,
      entry.style,
      entry.fund,
      entry.index,
      ifBenchmarked(entry.benchmark)
    ])
  }
  if (id === 'group_exposures') {
    return [
      ...groupWeights(run, 'sector', GICS_SECTORS, benchmarked),
      ...groupWeights(run, 'country', COUNTRIES, benchmarked)
    ]
  }
  if (id === 'style_box') {
    const fund = cellWeights(run, 'fund')
    const index = cellWeights(run, 'index')
    const benchmark = cellWeights(run, 'benchmark')
    return SIZES.flatMap((size, row) =>
      STYLES.map((style, column) => [
        size,
        style,
        fund[row * 3 + column] ?? 0,
        index[row * 3 + column] ?? 0,
        ifBenchmarked(benchmark[row * 3 + column] ?? 0)
      ])
    )
  }
  return undefined
}

/** The factsheet risk scale's volatility bounds: a 1 below the first, a 7 above the last. */
const RISK_BOUNDS = [0.005, 0.02, 0.05, 0.1, 0.15, 0.25]
/** Tracking error's bounds between the four bands, passive to unconstrained. */
const TRACKING_BOUNDS = [0.005, 0.02, 0.05]
const TRACKING_BANDS = ['passive', 'enhanced', 'active', 'unconstrained']

const ratingOf = (volatility: number): number =>
  1 + RISK_BOUNDS.filter((bound) => volatility >= bound).length
const bandOf = (trackingError: number): string =>
  TRACKING_BANDS[TRACKING_BOUNDS.filter((bound) => trackingError >= bound).length] ?? 'passive'

/*
 * The stub's lines are drawn apart for the charts to be legible, so their
 * tracking error is far above any real tracker's. The risk box takes a
 * tracker's instead: about 1.2% a year, wandering from window to window,
 * so TECH10's strategies read mid risk and Enhanced, as Karan expects
 * (2026-11-20).
 */
const trackingFor = (run: string, key: string): number => between(`${run}/te/${key}`, 0.004, 0.024)

/**
 * Each portfolio's rating, the fund's band too, as py-beacon gives them
 * (BN-428): the index and any benchmark have a rating and no band. A bound
 * exactly met takes the higher rating or band.
 */
function riskRating(lines: Lines, run: string): (string | number | null)[][] {
  const volatility = own(lines.strategy).volatility ?? 0
  const trackingError = between(`${run}/te`, 0.009, 0.016)
  const comparators: [string, Line | undefined][] = [
    ['index', lines.index],
    ['benchmark', lines.benchmark]
  ]
  return [
    ['fund', ratingOf(volatility), bandOf(trackingError), volatility, trackingError],
    ...comparators.flatMap(([book, line]) => {
      if (line === undefined) return []
      const theirs = own(line).volatility ?? 0
      return [[book, ratingOf(theirs), null, theirs, null]]
    })
  ]
}

/** The fund's days in each rating and band on rolling one-year figures; the first year has none. */
function riskDistribution(lines: Lines, run: string): (string | number)[][] {
  const window = 252
  const counts = new Map<string, number>()
  for (let end = window; end < lines.strategy.data.length; end++) {
    const cut = (line: Line): Line => ({
      index: line.index.slice(end - window, end + 1),
      data: line.data.slice(end - window, end + 1)
    })
    const fund = cut(lines.strategy)
    // A month's windows share a tracking error, so the bands change in runs, not daily.
    const trackingError = trackingFor(run, String(Math.floor(end / 21)))
    const key = `${String(ratingOf(own(fund).volatility ?? 0))}|${bandOf(trackingError)}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const total = [...counts.values()].reduce((sum, days) => sum + days, 0) || 1
  return [...counts]
    .map(([key, days]): [number, string, number, number] => {
      const [rating, band] = key.split('|')
      return [Number(rating), band ?? 'passive', days, days / total]
    })
    .sort(
      (one, other) =>
        one[0] - other[0] || TRACKING_BANDS.indexOf(one[1]) - TRACKING_BANDS.indexOf(other[1])
    )
}

/** The trading days each period looks back, or the whole run for since inception. */
const PERIODS: [string, number | 'mtd' | 'qtd' | 'ytd' | 'all'][] = [
  ['1M', 21],
  ['3M', 63],
  ['6M', 126],
  ['1Y', 252],
  ['3Y', 756],
  ['5Y', 1260],
  ['10Y', 2520],
  ['MTD', 'mtd'],
  ['QTD', 'qtd'],
  ['YTD', 'ytd'],
  ['inception', 'all']
]
/** Periods too short for a Sharpe ratio (Karan, BN-422): those cells are null. */
/**
 * The fewest days a figure is annualised over (BN-465): a rate a year, a
 * ratio six months. Shorter, it is null, judged by the window's length.
 */
const RATE_DAYS = 252
const RATIO_DAYS = 126
/** Each row's statistic, and the whole-run figure it is worked out as over the period. */
const OWN_ROWS: [string, string][] = [
  ['total_return', 'total_return'],
  ['annualised_return', 'annualised_return'],
  ['volatility', 'volatility'],
  ['max_drawdown', 'max_drawdown'],
  ['sharpe_ratio', 'sharpe_ratio']
]
const RELATIVE_ROWS: [string, string][] = [
  ['tracking_difference', 'tracking_difference'],
  ['tracking_error', 'tracking_error']
]

/**
 * The default `summary` statistic table (BN-467, py-beacon e4675d0): the
 * rows trailing_statistics gave, a statistic and window each, with the
 * fund less the index as `active` for the returns.
 */
function summaryTable(lines: Lines): unknown {
  const returns = ['total_return', 'annualised_return']
  const data = trailingStatistics(lines).map(
    ([window, statistic, unit, fund, index, benchmark]) => {
      const active =
        returns.includes(String(statistic)) && typeof fund === 'number' && typeof index === 'number'
          ? fund - index
          : null
      return [statistic, window, unit, fund, index, benchmark ?? null, active]
    }
  )
  return {
    index: data.map((_, at) => at),
    columns: ['statistic', 'window', 'unit', 'fund', 'index', 'benchmark', 'active'],
    data
  }
}

/**
 * Statistics by trailing period, a row per period and statistic. A period
 * longer than the run's history is null throughout: the engine has no figure
 * for it, and the app shows a dash.
 */
function trailingStatistics(lines: Lines): (string | number | null)[][] {
  const end = lines.strategy.data.length - 1
  const last = lines.strategy.index[end] ?? ''
  const month = Number(last.slice(5, 7))
  // The day before the first on or after a boundary: a to-date window's base.
  const since = (boundary: string): number =>
    Math.max(0, lines.strategy.index.findIndex((date) => date >= boundary) - 1)
  const quarter = String(month - ((month - 1) % 3)).padStart(2, '0')
  const starts = {
    mtd: since(last.slice(0, 7)),
    qtd: since(`${last.slice(0, 4)}-${quarter}`),
    ytd: since(last.slice(0, 4))
  }
  const rows: (string | number | null)[][] = []
  for (const [period, days] of PERIODS) {
    const from = days === 'all' ? 0 : typeof days === 'number' ? end - days : starts[days]
    const cut = (line: Line | undefined): Line | undefined =>
      line === undefined || from < 0
        ? undefined
        : { index: line.index.slice(from, end + 1), data: line.data.slice(from, end + 1) }
    const fund = cut(lines.strategy)
    const index = cut(lines.index)
    const benchmark = cut(lines.benchmark)
    const length = (fund?.data.length ?? 1) - 1
    for (const [statistic, figure] of OWN_ROWS) {
      const shown =
        (statistic !== 'annualised_return' || length >= RATE_DAYS) &&
        (statistic !== 'sharpe_ratio' || length >= RATIO_DAYS)
      const of = (line: Line | undefined): number | null =>
        line === undefined || !shown ? null : (own(line)[figure] ?? null)
      const unit = statistic === 'sharpe_ratio' ? 'ratio' : 'fraction'
      rows.push([period, statistic, unit, of(fund), of(index), of(benchmark)])
    }
    for (const [statistic, figure] of RELATIVE_ROWS) {
      const vs = (line: Line | undefined): number | null =>
        fund === undefined || line === undefined ? null : (against(fund, line)[figure] ?? null)
      rows.push([period, statistic, 'fraction', null, vs(index), vs(benchmark)])
    }
  }
  return rows
}

const nan = (row: number[]): (number | null)[] =>
  row.map((value) => (Number.isNaN(value) ? null : value))

function tableOf(statistic: StubStatistic, run: string, lines: Lines, years: string[]): unknown {
  const columns = statistic.columns ?? []
  const portfolio = portfolioTable(statistic.id, run, lines.benchmark !== undefined)
  if (portfolio !== undefined) {
    return {
      index: portfolio.map((_, at) => at),
      columns: columns.map((column) => column.name),
      data: portfolio
    }
  }
  const measured = measuredTable(statistic.id, lines, years, run)
  if (measured !== undefined) {
    return {
      index: measured.map((_, at) => at),
      columns: columns.map((column) => column.name),
      data: measured
    }
  }
  const signed = SIGNED_CATEGORIES.includes(statistic.category)
  const rows = rowsOf(statistic.id, years)
  const data = rows.map((row) =>
    columns.map((column, at) => {
      const key = `${run}/${statistic.id}/${row}/${column.name}`
      if (at === 0) return row
      if (column.unit === 'date')
        return `${years.at(-1) ?? '2025'}-0${String(1 + Math.floor(noise(key) * 9))}-15`
      if (column.unit === 'days' || column.unit === 'count') return Math.round(between(key, 2, 40))
      if (column.unit === 'money') return Math.round(between(key, 2e3, 9e5))
      if (column.unit === 'bps') return between(key, 0.5, 12)
      if (column.unit === 'ratio') return between(key, 0.1, 1.4)
      if (column.unit === 'fraction')
        return signed ? between(key, -0.12, 0.22) : between(key, 0.01, 0.3)
      return between(key, 0, 1) > 0.5 ? 'Rebalance' : 'Flows'
    })
  )
  return { index: rows.map((_, at) => at), columns: columns.map((column) => column.name), data }
}

/** The run's `analytics` block, every report at extended with its optional statistics computed too. */
export function analyticsFor(run: { strategyId: string }, lines: Lines): unknown {
  const years = [...new Set(lines.strategy.index.map((date) => date.slice(0, 4)))]
  const statistics: Record<string, unknown> = {}
  const unavailable: Record<string, { code: string; reason: string }> = {}
  for (const statistic of CATALOGUE_STATISTICS) {
    const missing = unavailableOf(statistic.id)
    if (missing !== undefined) {
      unavailable[statistic.id] = missing
      continue
    }
    const risk = riskTable(statistic.id, lines)
    if (risk !== undefined) {
      // A book the run lacks has no column (py-beacon d817ec8).
      const columns = (statistic.columns ?? [])
        .map((column) => column.name)
        .filter((name) => lines.benchmark !== undefined || name !== 'benchmark')
      statistics[statistic.id] = {
        kind: 'table',
        point: { index: risk.rows.map((_, at) => at), columns, data: risk.rows },
        ...(risk.summary === undefined ? {} : { summary: risk.summary })
      }
      continue
    }
    if (statistic.kind === 'table') {
      statistics[statistic.id] = {
        kind: 'table',
        point: tableOf(statistic, run.strategyId, lines, years)
      }
      continue
    }
    if (statistic.kind === 'series') continue
    const point = figuresOf(statistic, run.strategyId, lines)
    statistics[statistic.id] = {
      kind: 'figures',
      point,
      ...(statistic.rolling === null || statistic.figure_names !== undefined
        ? {}
        : { rolling: rollingOf(statistic, lines, point) })
    }
  }
  const reports = Object.fromEntries(
    CATALOGUE_REPORTS.map((report) => [
      report.id,
      {
        level: 'extended',
        statistics: report.levels.extended.sections.flatMap((section) =>
          section.statistics.map((entry) => ({ id: entry.id, view: entry.view }))
        )
      }
    ])
  )
  return {
    status: 'computed',
    analytics: {
      request: {
        reports: Object.fromEntries(CATALOGUE_REPORTS.map((report) => [report.id, 'extended']))
      },
      active_against: 'index',
      reports,
      statistics,
      unavailable,
      statistic_tables: { summary: summaryTable(lines), risk: riskStatisticTable(lines) },
      tables: {
        trades: {
          rows: tradesOf(lines).length,
          path: `/strategies/${run.strategyId}/tables/trades`
        }
      },
      timings: {
        tables: 0.4,
        performance: 0.3,
        portfolio: 0.6,
        risk: 2.1,
        attribution: 0.9,
        statistic_tables: 0.2
      }
    }
  }
}

const TRADE_COLUMNS = [
  { name: 'date', label: 'Date', unit: 'date' },
  { name: 'name', label: 'Name', unit: null },
  { name: 'side', label: 'Side', unit: null, labels: { buy: 'Buy', sell: 'Sell' } },
  { name: 'units', label: 'Units', unit: 'count' },
  { name: 'price', label: 'Price', unit: 'money' },
  { name: 'value', label: 'Value', unit: 'money' },
  { name: 'cost', label: 'Cost', unit: 'money' },
  { name: 'impact', label: 'Market impact', unit: 'money' },
  {
    name: 'reason',
    label: 'Reason',
    unit: null,
    labels: {
      rebalance: 'Rebalance',
      'dividend reinvestment': 'Dividend reinvestment',
      'corporate action': 'Corporate action',
      'cash band': 'Cash band',
      'fee funding': 'Fee funding',
      'fx hedge': 'Currency hedge',
      'futures roll': 'Futures roll',
      'futures exposure': 'Futures exposure',
      flows: 'Flows'
    }
  },
  { name: 'tags', label: 'Tags', unit: null }
]

interface Trade {
  date: string
  name: string
  side: 'buy' | 'sell'
  units: number
  price: number
  reason: string
}

/** The run's trades: each month-end rebalance, and dividends, cash band and flows between. */
function tradesOf(lines: Lines): Trade[] {
  const trades: Trade[] = []
  const dates = lines.strategy.index.map((date) => date.slice(0, 10))
  dates.forEach((date, at) => {
    const next = dates[at + 1]
    const monthEnd = next?.slice(0, 7) !== date.slice(0, 7)
    for (const name of NAMES) {
      const key = `${date}/${name}`
      const price = 40 + noise(name) * 300 * ((lines.strategy.data[at] ?? 100) / 100)
      if (monthEnd) {
        trades.push({
          date,
          name,
          side: noise(key) > 0.45 ? 'buy' : 'sell',
          units: Math.round(between(key, 50, 4000)),
          price,
          reason: 'rebalance'
        })
      } else if (noise(`${key}/div`) > 0.985) {
        trades.push({
          date,
          name,
          side: 'buy',
          units: Math.round(between(key, 5, 120)),
          price,
          reason: 'dividend reinvestment'
        })
      } else if (noise(`${key}/flow`) > 0.993) {
        trades.push({
          date,
          name,
          side: noise(`${key}/side`) > 0.5 ? 'buy' : 'sell',
          units: Math.round(between(key, 20, 900)),
          price,
          reason: noise(key) > 0.5 ? 'flows' : 'cash band'
        })
      }
    }
  })
  return trades
}

/** GET /strategies/{id}/tables/trades in the by-column JSON: repeated text sent once, a code per row. */
export function tradesTable(lines: Lines): unknown {
  const trades = tradesOf(lines)
  const coded = (values: string[]): { values: string[]; codes: number[] } => {
    const distinct = [...new Set(values)]
    const at = new Map(distinct.map((value, position) => [value, position]))
    return { values: distinct, codes: values.map((value) => at.get(value) ?? 0) }
  }
  const round = (value: number, places: number): number => Number(value.toFixed(places))
  return {
    length: trades.length,
    columns: {
      date: coded(trades.map((trade) => trade.date)),
      name: coded(trades.map((trade) => trade.name)),
      side: coded(trades.map((trade) => trade.side)),
      units: trades.map((trade) => trade.units),
      price: trades.map((trade) => round(trade.price, 4)),
      value: trades.map((trade) => round(trade.units * trade.price, 2)),
      cost: trades.map((trade) => round(trade.units * trade.price * 0.0005, 4)),
      impact: trades.map((trade) => round(trade.units * trade.price * 0.0002, 4)),
      reason: coded(trades.map((trade) => trade.reason))
    },
    constant: { tags: null },
    decimals: { units: 6, price: 4, value: 2, cost: 4, impact: 4 }
  }
}
