import { findColumn, num, toRows, type TableFrame } from '../../api/frame'

/** Trading days, not calendar days — the frame is indexed by session. */
const DAYS_1M = 21
const DAYS_3M = 63

export interface WatchRow {
  ticker: string
  name: string | undefined
  last: number | undefined
  change1D: number | undefined
  change1M: number | undefined
  changeYTD: number | undefined
  volume: number | undefined
  marketCap: number | undefined
  /** Closes for the 3-month sparkline, oldest first. */
  spark: number[]
  /** Still fetching, so the row renders skeleton dashes rather than zeros. */
  pending: boolean
}

function percentChange(now: number | undefined, then: number | undefined): number | undefined {
  if (now === undefined || then === undefined || then === 0) return undefined
  return ((now - then) / then) * 100
}

function year(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = Number(value.slice(0, 4))
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * The last close of the previous calendar year.
 *
 * YTD is measured from that bar, not from the first bar of this year — a
 * stock that gapped on 2 January would otherwise show none of the move that
 * everyone means by "year to date".
 */
function priorYearClose(
  rows: readonly { index: unknown }[],
  closes: readonly (number | undefined)[]
): number | undefined {
  const latest = year(rows[rows.length - 1]?.index)
  if (latest === undefined) return undefined

  for (let i = rows.length - 1; i >= 0; i--) {
    if (year(rows[i]?.index) === latest) continue
    return closes[i]
  }
  return undefined
}

export interface RowInputs {
  ticker: string
  prices: TableFrame | undefined
  reference: Record<string, unknown> | undefined
  pending: boolean
}

/** Everything one watchlist row shows, derived from what the engine sent. */
export function buildRow(input: RowInputs): WatchRow {
  const rows = toRows(input.prices)
  const closeColumn =
    findColumn(input.prices, 'close') ?? findColumn(input.prices, 'adj close', 'adj_close')
  const volumeColumn = findColumn(input.prices, 'volume')

  const closes = rows.map((row) => (closeColumn === undefined ? undefined : num(row, closeColumn)))
  const last = closes[closes.length - 1]

  return {
    ticker: input.ticker,
    name: readString(input.reference, ['name', 'long_name', 'longname', 'short_name']),
    last,
    change1D: percentChange(last, closes[closes.length - 2]),
    change1M: percentChange(last, closes[closes.length - 1 - DAYS_1M]),
    changeYTD: percentChange(last, priorYearClose(rows, closes)),
    volume: volumeColumn === undefined ? undefined : num(rows[rows.length - 1], volumeColumn),
    marketCap: readNumber(input.reference, ['market_cap', 'marketcap']),
    spark: closes.slice(-DAYS_3M).filter((value): value is number => value !== undefined),
    pending: input.pending
  }
}

function readString(
  fields: Record<string, unknown> | undefined,
  aliases: readonly string[]
): string | undefined {
  if (fields === undefined) return undefined
  const index = new Map(Object.entries(fields).map(([key, value]) => [key.toLowerCase(), value]))
  for (const alias of aliases) {
    const value = index.get(alias)
    if (typeof value === 'string' && value !== '') return value
  }
  return undefined
}

function readNumber(
  fields: Record<string, unknown> | undefined,
  aliases: readonly string[]
): number | undefined {
  if (fields === undefined) return undefined
  const index = new Map(Object.entries(fields).map(([key, value]) => [key.toLowerCase(), value]))
  for (const alias of aliases) {
    const value = index.get(alias)
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

export interface WatchSummary {
  symbols: number
  up: number
  down: number
  averageDay: number | undefined
  best: WatchRow | undefined
  worst: WatchRow | undefined
}

/**
 * The summary line, over rows that have actually arrived.
 *
 * Rows still loading are excluded rather than counted as flat: an average
 * that drifts as requests land would be worse than one that appears late.
 */
export function summariseRows(rows: readonly WatchRow[]): WatchSummary {
  const days = rows
    .map((row) => row.change1D)
    .filter((value): value is number => value !== undefined)

  const rated = rows.filter((row) => row.changeYTD !== undefined)
  const sorted = [...rated].sort((a, b) => (b.changeYTD ?? 0) - (a.changeYTD ?? 0))

  return {
    symbols: rows.length,
    up: days.filter((value) => value > 0).length,
    down: days.filter((value) => value < 0).length,
    averageDay:
      days.length === 0 ? undefined : days.reduce((total, value) => total + value, 0) / days.length,
    best: sorted[0],
    worst: sorted[sorted.length - 1]
  }
}

/** 3.16e12 → "3.16T". Market caps are unreadable at full precision. */
export function compactCap(value: number | undefined): string {
  if (value === undefined) return '—'
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  return value.toLocaleString('en-US')
}

/**
 * A polyline through the closes, normalised into a 0–1 box.
 *
 * Flat series collapse to the middle rather than dividing by a zero range,
 * which would put the whole line at NaN and render nothing at all.
 */
export function sparkPoints(values: readonly number[], width: number, height: number): string {
  if (values.length < 2) return ''

  const low = Math.min(...values)
  const high = Math.max(...values)
  const range = high - low

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width
      const y = range === 0 ? height / 2 : height - ((value - low) / range) * height
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}
