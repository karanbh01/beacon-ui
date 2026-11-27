import { random, seedOf } from './stubRisk'

/*
 * GET /strategies/{id}/instrument/{identifier} (py-beacon BN-468..474): a
 * name's profile for Drilldown, every part a dated table. Built from the
 * name's own price line, so its weights drift with its price, its
 * contribution follows its returns and its events fall on its rebalances.
 * Seeded by the name, so a read is the same every time.
 */

type Cell = string | number | boolean | null
type Unit = 'fraction' | 'ratio' | 'count' | 'days' | 'money' | 'date' | null

interface Column {
  name: string
  label: string
  unit: Unit
  labels: Record<string, string> | null
}

interface Part {
  columns: Column[]
  dates: string[]
  data: Cell[][]
}

const col = (
  name: string,
  label: string,
  unit: Unit = null,
  labels: Record<string, string> | null = null
): Column => ({ name, label, unit, labels })

/** A quarter's business days apart, as the stub's strategies rebalance. */
const REBALANCE_EVERY = 63
/** The fund's assets, for a holding's value. */
const AUM = 250e6
const FACTORS = ['market', 'size', 'value', 'momentum']
const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

export const EVENT_LABELS: Record<string, string> = {
  added_to_fund: 'Added to the fund',
  removed_from_fund: 'Sold out of the fund',
  added_to_index: 'Added to the index',
  removed_from_index: 'Removed from the index',
  capped: 'Capped',
  screened_out: 'Screened out',
  corporate_action: 'Corporate action',
  near_miss: 'Came close to failing a rule'
}

const COMPARISONS = {
  ge: 'At least',
  gt: 'Above',
  le: 'At most',
  lt: 'Below',
  eq: 'Equal to',
  ne: 'Not equal to',
  in: 'One of',
  between: 'Between'
}

interface Name {
  identifier: string
  dates: string[]
  prices: number[]
  /** Each rebalance's position in `dates`. */
  rebalances: number[]
  /** The weight it was traded to at each rebalance. */
  targets: number[]
  /** The index's weight at each rebalance. */
  indexWeights: number[]
  /** The rebalance a cap cut it at, if any. */
  capped: number | undefined
  next: () => number
}

function nameOf(identifier: string, level: { index: string[]; data: number[] }): Name {
  const next = random(seedOf(`${identifier}/profile`))
  const dates = level.index.map((date) => date.slice(0, 10))
  const rebalances = dates.map((_, at) => at).filter((at) => at % REBALANCE_EVERY === 0)
  const base = 0.04 + 0.06 * next()
  const targets = rebalances.map(() => Number((base * (0.8 + 0.4 * next())).toFixed(4)))
  const indexWeights = targets.map((weight) => Number((weight * (0.85 + 0.3 * next())).toFixed(4)))
  const capped = next() < 0.7 ? 1 + Math.floor(next() * (rebalances.length - 2)) : undefined
  return {
    identifier,
    dates,
    prices: level.data,
    rebalances,
    targets,
    indexWeights,
    capped,
    next
  }
}

/** The rebalance a day falls after. */
const lastRebalance = (name: Name, day: number): number =>
  Math.max(0, name.rebalances.filter((at) => at <= day).length - 1)

/** Each day's weight, drifting with the price from the last rebalance's target. */
function drifted(name: Name, weights: readonly number[]): number[] {
  return name.dates.map((_, day) => {
    const at = lastRebalance(name, day)
    const from = name.rebalances[at] ?? 0
    const drift = (name.prices[day] ?? 1) / (name.prices[from] ?? 1)
    // The rest of the fund grows too, about half as fast as this name moves.
    return Number(((weights[at] ?? 0) * drift ** 0.5).toFixed(5))
  })
}

function dailyWeights(name: Name): Part {
  const fund = drifted(name, name.targets)
  const index = drifted(name, name.indexWeights)
  // The benchmark leans a little off the index, by rebalance, without drawing on the seed.
  const benchmark = drifted(
    name,
    name.indexWeights.map((weight, at) => Number((weight * (1.1 + 0.2 * Math.sin(at))).toFixed(4)))
  )
  return {
    columns: [
      col('fund', 'Fund', 'fraction'),
      col('index', 'Index', 'fraction'),
      col('benchmark', 'Benchmark', 'fraction'),
      col('active', 'Active', 'fraction')
    ],
    dates: name.dates,
    data: fund.map((weight, day) => [
      weight,
      index[day] ?? 0,
      benchmark[day] ?? 0,
      Number((weight - (index[day] ?? 0)).toFixed(5))
    ])
  }
}

function rebalanceWeights(name: Name): Part {
  return {
    columns: [
      col('target', 'Target', 'fraction'),
      col('screened', 'Screened', 'fraction'),
      col('weight', 'Traded to', 'fraction'),
      col('capped', 'Capped', 'fraction'),
      col('removed', 'Removed by'),
      col('index', 'Index', 'fraction')
    ],
    dates: name.rebalances.map((at) => name.dates[at] ?? ''),
    data: name.targets.map((weight, at) => {
      const cut = at === name.capped
      const target = cut ? Number((weight * 1.3).toFixed(4)) : weight
      return [target, target, weight, cut ? weight : null, null, name.indexWeights[at] ?? 0]
    })
  }
}

/** The contribution by quarter, month or year, linked as a share of the window. */
function attribution(name: Name, by: string): Part {
  const fund = drifted(name, name.targets)
  const index = drifted(name, name.indexWeights)
  const keyOf = (date: string): string => {
    if (by === 'month') return date.slice(0, 7)
    if (by === 'year') return date.slice(0, 4)
    return `${date.slice(0, 4)}-Q${String(Math.ceil(Number(date.slice(5, 7)) / 3))}`
  }
  const periods = new Map<string, { last: string; total: number; active: number }>()
  for (let day = 1; day < name.dates.length; day += 1) {
    const move = (name.prices[day] ?? 1) / (name.prices[day - 1] ?? 1) - 1
    const date = name.dates[day] ?? ''
    const period = periods.get(keyOf(date)) ?? { last: date, total: 0, active: 0 }
    period.last = date
    period.total += (fund[day - 1] ?? 0) * move
    period.active += ((fund[day - 1] ?? 0) - (index[day - 1] ?? 0)) * move
    periods.set(keyOf(date), period)
  }
  let total = 0
  let active = 0
  const data = [...periods.values()].map((period): Cell[] => {
    total += period.total
    active += period.active
    return [period.total, total, period.active, active].map((value) => Number(value.toFixed(6)))
  })
  return {
    columns: [
      col('contribution', 'Contribution', 'fraction'),
      col('contribution_to_date', 'Contribution to date', 'fraction'),
      col('active_contribution', 'Active contribution', 'fraction'),
      col('active_contribution_to_date', 'Active contribution to date', 'fraction')
    ],
    dates: [...periods.values()].map((period) => period.last),
    data
  }
}

/** A row a rebalance with a year of history behind it, as the risk model needs. */
function modelled(name: Name): number[] {
  return name.rebalances.map((_, at) => at).filter((at) => (name.rebalances[at] ?? 0) >= 252)
}

function risk(name: Name): Part {
  const rows = modelled(name)
  return {
    columns: [
      col('volatility_contribution', 'Contribution to volatility', 'fraction'),
      col('volatility_share', 'Share of volatility', 'fraction'),
      col('tracking_error_contribution', 'Contribution to tracking error', 'fraction'),
      col('tracking_error_share', 'Share of tracking error', 'fraction')
    ],
    dates: rows.map((at) => name.dates[name.rebalances[at] ?? 0] ?? ''),
    data: rows.map((at) => {
      const weight = name.targets[at] ?? 0
      const volatility = weight * (0.18 + 0.1 * name.next())
      const tracking = Math.abs(weight - (name.indexWeights[at] ?? 0)) * (0.2 + 0.1 * name.next())
      return [volatility, volatility / 0.16, tracking, tracking / 0.012].map((value) =>
        Number(value.toFixed(5))
      )
    })
  }
}

function liquidity(name: Name): Part {
  const traded = 40e6 + 200e6 * name.next()
  return {
    columns: [
      col('value', 'Holding', 'money'),
      col('traded_value', 'Average daily traded value', 'money'),
      col('days_to_sell', 'Days to sell', 'days')
    ],
    dates: name.rebalances.map((at) => name.dates[at] ?? ''),
    data: name.targets.map((weight, at) => {
      const value = weight * AUM
      const average = traded * (0.8 + 0.4 * ((at * 7) % 5) * 0.1)
      // At a fifth of the day's trading, as the liquidity options default.
      return [Math.round(value), Math.round(average), Number((value / (average * 0.2)).toFixed(2))]
    })
  }
}

function factorExposures(name: Name): Part {
  const rows = modelled(name)
  const base = FACTORS.map((factor) => (factor === 'market' ? 1 : name.next() * 1.6 - 0.8))
  return {
    columns: [
      ...FACTORS.map((factor) => col(`exposure/${factor}`, capital(factor), 'ratio')),
      col('country', 'Country'),
      col('sector', 'Sector'),
      col('currency', 'Currency')
    ],
    dates: rows.map((at) => name.dates[name.rebalances[at] ?? 0] ?? ''),
    data: rows.map((_, row) => [
      ...base.map((exposure) => Number((exposure + 0.05 * Math.sin(row + exposure)).toFixed(3))),
      'United States',
      'Information Technology',
      null
    ])
  }
}

function factorBetas(name: Name): Part {
  const rows = modelled(name)
  const columns = [
    ...FACTORS.flatMap((factor) => [
      col(`beta/${factor}`, `${capital(factor)} beta`, 'ratio'),
      col(`t_stat/${factor}`, `${capital(factor)} t-statistic`, 'ratio')
    ]),
    col('r_squared', 'R-squared', 'fraction'),
    col('observations', 'Observations', 'count')
  ]
  return {
    columns,
    dates: rows.map((at) => name.dates[name.rebalances[at] ?? 0] ?? ''),
    data: rows.map(() => [
      ...FACTORS.flatMap((factor) => {
        const beta = factor === 'market' ? 0.9 + 0.4 * name.next() : name.next() * 1.2 - 0.6
        // Single-name betas are noisy: a style beta's t-statistic is often under 2.
        const t = beta / (factor === 'market' ? 0.08 : 0.25 + 0.2 * name.next())
        return [Number(beta.toFixed(3)), Number(t.toFixed(2))]
      }),
      Number((0.3 + 0.4 * name.next()).toFixed(3)),
      252
    ])
  }
}

function style(name: Name): Part {
  const size = 0.4 + 0.5 * name.next()
  const lean = name.next() * 2 + 0.5
  let previous = ''
  return {
    columns: [
      col('size_position', 'Size position'),
      col('style_position', 'Style position'),
      col('size', 'Size', null, { large: 'Large', mid: 'Mid', small: 'Small' }),
      col('style', 'Style', null, { value: 'Value', blend: 'Blend', growth: 'Growth' }),
      col('moved', 'Moved box')
    ],
    dates: name.rebalances.map((at) => name.dates[at] ?? ''),
    data: name.rebalances.map((_, at) => {
      const across = Math.min(2.95, Math.max(0.05, lean + 0.35 * Math.sin(at * 1.3)))
      // Its size wanders a little too as its market cap moves against the others'.
      const down = Math.max(0.05, size + 0.15 * Math.sin(at * 0.7))
      const sizeCode = down < 1 ? 'large' : size < 2 ? 'mid' : 'small'
      const styleCode = across < 1 ? 'value' : across < 2 ? 'blend' : 'growth'
      const cell = `${sizeCode}/${styleCode}`
      const moved = previous !== '' && previous !== cell
      previous = cell
      return [Number(down.toFixed(3)), Number(across.toFixed(3)), sizeCode, styleCode, moved]
    })
  }
}

function keyData(name: Name): Part {
  const cap = 80e9 + 2.5e12 * name.next() ** 2
  return {
    columns: [
      col('name', 'Name'),
      col('currency', 'Currency'),
      col('exchange', 'Exchange'),
      col('sector', 'Sector'),
      col('country_domicile', 'Country domicile'),
      col('market_cap', 'Market cap', 'money'),
      col('traded_value', 'Average daily traded value', 'money'),
      col('free_float', 'Free float', 'fraction')
    ],
    dates: name.rebalances.map((at) => name.dates[at] ?? ''),
    data: name.rebalances.map((at) => [
      `${name.identifier} Inc.`,
      'USD',
      'NASDAQ',
      'Information Technology',
      'United States',
      Math.round(cap * ((name.prices[at] ?? 100) / 100)),
      Math.round(cap * 0.004),
      0.97
    ])
  }
}

/** A dividend each quarter, two weeks after the rebalance. */
function dividends(name: Name): { date: string; amount: number }[] {
  return name.rebalances
    .map((at) => at + 10)
    .filter((at) => at < name.dates.length)
    .map((at) => ({
      date: name.dates[at] ?? '',
      amount: Number((0.2 + 0.05 * (at % 3)).toFixed(2))
    }))
}

function corporateActions(name: Name): Part {
  const paid = dividends(name)
  return {
    columns: [col('type', 'Type'), col('amount', 'Amount or ratio')],
    dates: paid.map((dividend) => dividend.date),
    data: paid.map((dividend) => ['DIVIDEND', dividend.amount])
  }
}

function trades(name: Name): Part {
  const rows = name.rebalances.map((at, position) => {
    const price = name.prices[at] ?? 100
    const before = position === 0 ? 0 : (name.targets[position - 1] ?? 0)
    const change = (name.targets[position] ?? 0) - before
    const notional = Math.abs(change) * AUM
    return {
      date: name.dates[at] ?? '',
      cells: [
        change >= 0 ? 'BUY' : 'SELL',
        Math.round(notional / price),
        price,
        Math.round(notional),
        Number((notional * 0.0005).toFixed(2)),
        Number((notional * 0.0002).toFixed(2)),
        'rebalance',
        position === name.capped ? 'capped' : ''
      ] as Cell[]
    }
  })
  return {
    columns: [
      col('side', 'Side'),
      col('quantity', 'Shares'),
      col('price', 'Price', 'money'),
      col('notional', 'Notional', 'money'),
      col('cost', 'Cost', 'money'),
      col('impact', 'Market impact', 'money'),
      col('reason', 'Reason'),
      col('tags', 'Tags')
    ],
    dates: rows.map((row) => row.date),
    data: rows.map((row) => row.cells)
  }
}

/** The rules each rebalance tested, and how far the name was from failing each. */
function selection(name: Name): Part {
  const rows: { date: string; cells: Cell[] }[] = []
  name.rebalances.forEach((at, position) => {
    const date = name.dates[at] ?? ''
    const cap = 5e9 * (1.04 + 0.6 * name.next())
    const volume = 2e6 * (1.5 + 2 * name.next())
    // One rebalance where the name only just cleared the size floor.
    const close = position === 2 ? 5e9 * 1.06 : cap
    rows.push({ date, cells: [1, 'MarketCapRule', 'market_cap', close, 'ge', 5e9] })
    rows.push({ date, cells: [2, 'LiquidityRule', 'avg_daily_volume', volume, 'ge', 2e6] })
  })
  return {
    columns: [
      col('rule', 'Rule'),
      col('rule_name', 'Rule type'),
      col('measure', 'Measured'),
      col('measured', 'Value'),
      col('comparison', 'Comparison', null, COMPARISONS),
      col('threshold', 'Threshold'),
      col('margin', 'Margin', 'fraction'),
      col('passed', 'Passed')
    ],
    dates: rows.map((row) => row.date),
    data: rows.map(({ cells }) => {
      const measured = Number(cells[3])
      const threshold = Number(cells[5])
      const margin = Number(((measured - threshold) / threshold).toFixed(4))
      return [...cells, margin, margin >= 0]
    })
  }
}

/** Every event, oldest first: the name's days in the fund and index, its cap, its near misses and dividends. */
function events(name: Name, picked: Part): Part {
  const rows: { date: string; event: string; detail: Cell; amount: Cell }[] = []
  const first = name.dates[name.rebalances[0] ?? 0] ?? ''
  rows.push({ date: first, event: 'added_to_index', detail: null, amount: null })
  rows.push({ date: first, event: 'added_to_fund', detail: null, amount: null })
  if (name.capped !== undefined) {
    const date = name.dates[name.rebalances[name.capped] ?? 0] ?? ''
    rows.push({ date, event: 'capped', detail: null, amount: name.targets[name.capped] ?? null })
  }
  picked.data.forEach((cells, at) => {
    const margin = cells[6]
    if (typeof margin === 'number' && margin >= 0 && margin < 0.1) {
      rows.push({
        date: picked.dates[at] ?? '',
        event: 'near_miss',
        detail: `${String(cells[1])}: ${String(cells[2])}`,
        amount: margin
      })
    }
  })
  for (const dividend of dividends(name)) {
    rows.push({
      date: dividend.date,
      event: 'corporate_action',
      detail: 'DIVIDEND',
      amount: dividend.amount
    })
  }
  rows.sort((one, other) => one.date.localeCompare(other.date))
  return {
    columns: [
      col('event', 'Event', null, EVENT_LABELS),
      col('detail', 'Detail'),
      col('amount', 'Amount')
    ],
    dates: rows.map((row) => row.date),
    data: rows.map((row) => [row.event, row.detail, row.amount])
  }
}

/** The portfolios the stub's runs keep: the fund and its two comparators. */
const PORTFOLIOS = ['fund', 'index', 'benchmark']

/** The calendar cuts, by their `period` code, and the bucket each day falls in. */
const CALENDAR: Record<string, (date: string) => string> = {
  year: (date) => date.slice(0, 4),
  quarter: (date) => `${date.slice(0, 4)}Q${String(Math.ceil(Number(date.slice(5, 7)) / 3))}`,
  month: (date) => date.slice(0, 7)
}

/**
 * The name's return and risk over the run, each rebalance period and each
 * year, quarter and month, against each portfolio (py-beacon BN-477,
 * `period_statistics` since BN-481; the calendar cuts and no tracking error as asked of it
 * 2026-11-27 and accepted).
 * Its own return and volatility are from its price; the rest are made up
 * about them, seeded, the same shape as the engine's.
 */
function returnRisk(name: Name): Part {
  const last = name.dates.length - 1
  /*
   * BN-477 (Karan): a period runs from the day after a rebalance to the next
   * rebalance day, as the fund trades at the close and that day's return is
   * earned on the old holdings. `from` is the rebalance, the price returns
   * are measured from; the period's first day is the one after it.
   */
  const periods = [
    { code: 'run', from: 0, to: last, first: 0 },
    ...name.rebalances.map((from, at) => ({
      code: 'rebalance',
      from,
      to: Math.min(last, name.rebalances[at + 1] ?? last),
      first: from + 1
    })),
    // A calendar period is measured from the close before its first day, clipped to the window.
    ...Object.entries(CALENDAR).flatMap(([code, bucket]) =>
      name.dates.flatMap((date, at) => {
        const previous = name.dates[at - 1]
        if (previous !== undefined && bucket(previous) === bucket(date)) return []
        let to = at
        while (to < last && bucket(name.dates[to + 1] ?? '') === bucket(date)) to += 1
        return [{ code, from: Math.max(0, at - 1), to, first: at }]
      })
    )
  ].filter((period) => period.to > period.from)
  const relative = ['excess_return', 'contribution', 'beta', 'correlation', 'volatility_share']
  const labels: Record<string, string> = {
    excess_return: 'Excess return',
    contribution: 'Contribution to return',
    beta: 'Beta',
    correlation: 'Correlation',
    volatility_share: 'Share of volatility'
  }
  const units: Record<string, Unit> = {
    excess_return: 'fraction',
    contribution: 'fraction',
    beta: 'ratio',
    correlation: 'ratio',
    volatility_share: 'fraction'
  }
  return {
    columns: [
      col('period', 'Period', null, {
        run: 'All periods',
        rebalance: 'Rebalance period',
        year: 'Year',
        quarter: 'Quarter',
        month: 'Month'
      }),
      col('start', 'From', 'date'),
      col('return', 'Total return', 'fraction'),
      col('volatility', 'Volatility', 'fraction'),
      ...relative.flatMap((figure) =>
        PORTFOLIOS.map((portfolio) =>
          col(
            `${figure}/${portfolio}`,
            `${labels[figure] ?? figure}, ${portfolio}`,
            units[figure] ?? null
          )
        )
      )
    ],
    dates: periods.map((period) => name.dates[period.to] ?? ''),
    data: periods.map((period) => {
      const days = name.prices.slice(period.from, period.to + 1)
      const total = (days.at(-1) ?? 1) / (days[0] ?? 1) - 1
      const daily = days.slice(1).map((price, at) => price / (days[at] ?? price) - 1)
      const mean = daily.reduce((sum, value) => sum + value, 0) / Math.max(daily.length, 1)
      const variance =
        daily.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(daily.length - 1, 1)
      const volatility = Math.sqrt(variance * 252)
      const weight = name.targets[Math.max(0, lastRebalance(name, period.from))] ?? 0.05
      const figures = PORTFOLIOS.flatMap((_, place) => {
        const held = place === 0 ? weight : weight * (0.85 + 0.3 * name.next())
        const correlation = 0.7 + 0.25 * name.next()
        const theirs = total * (0.6 + 0.2 * place * name.next()) + 0.01 * (name.next() - 0.5)
        return [
          total - theirs,
          held * total,
          correlation * (1.1 + 0.3 * name.next()),
          correlation,
          held * (1.4 + 0.4 * name.next())
        ]
      })
      // Columns are figure-major: every portfolio's excess return, then every contribution, ...
      const byFigure = relative.flatMap((_, figure) =>
        PORTFOLIOS.map((__, place) => figures[place * relative.length + figure] ?? null)
      )
      return [
        period.code,
        name.dates[period.first] ?? '',
        Number(total.toFixed(5)),
        Number(volatility.toFixed(5)),
        ...byFigure.map((value) => (value === null ? null : Number(value.toFixed(5))))
      ]
    })
  }
}

export function profileOf(
  identifier: string,
  level: { index: string[]; data: number[] },
  query: URLSearchParams
): unknown {
  const name = nameOf(identifier, level)
  const by = query.get('by') ?? 'quarter'
  const picked = selection(name)
  return {
    identifier,
    currency: 'USD',
    start: name.dates[0] ?? null,
    end: name.dates.at(-1) ?? null,
    against: 'index',
    by,
    linking: 'window',
    parts: {
      rebalance_weights: rebalanceWeights(name),
      daily_weights: dailyWeights(name),
      attribution: attribution(name, by),
      risk: risk(name),
      liquidity: liquidity(name),
      factor_exposures: factorExposures(name),
      factor_betas: factorBetas(name),
      style: style(name),
      key_data: keyData(name),
      corporate_actions: corporateActions(name),
      trades: trades(name),
      events: events(name, picked),
      selection: picked,
      period_statistics: returnRisk(name)
    },
    unavailable: {}
  }
}
