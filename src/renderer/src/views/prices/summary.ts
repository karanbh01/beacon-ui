import { findColumn, num, toRows, type FrameRow, type TableFrame } from '../../api/frame'

/**
 * Every field is explicitly `| undefined` rather than merely optional:
 * exactOptionalPropertyTypes distinguishes "absent" from "present and
 * undefined", and this summary genuinely assigns undefined when a column or
 * a prior row is missing.
 */
export interface ResolvedColumns {
  open: string | undefined
  high: string | undefined
  low: string | undefined
  close: string | undefined
  adjClose: string | undefined
  volume: string | undefined
}

export interface PriceSummary {
  lastClose: number | undefined
  changeAbs: number | undefined
  changePct: number | undefined
  low52: number | undefined
  high52: number | undefined
  avgVolume3M: number | undefined
  rows: FrameRow[]
  /** Resolved column names, so the table renders whatever py-beacon sent. */
  columns: ResolvedColumns
  firstDate: string | undefined
  lastDate: string | undefined
}

const TRADING_DAYS_YEAR = 252
const TRADING_DAYS_3M = 63

function isoDate(value: unknown): string | undefined {
  return typeof value === 'string' ? value.slice(0, 10) : undefined
}

/**
 * Derive the summary strip from the frame.
 *
 * Computed client-side rather than asked for: py-beacon serves the series,
 * and a second round trip for four numbers already implied by it would be
 * slower and could disagree with the table underneath.
 *
 * Rows are assumed newest-last, which is how a date-indexed pandas frame
 * arrives. The last row is therefore the latest bar.
 */
export function summarise(frame: TableFrame | undefined): PriceSummary {
  const rows = toRows(frame)
  const columns = {
    open: findColumn(frame, 'open'),
    high: findColumn(frame, 'high'),
    low: findColumn(frame, 'low'),
    close: findColumn(frame, 'close'),
    adjClose: findColumn(frame, 'adj close', 'adj_close', 'adjclose'),
    volume: findColumn(frame, 'volume')
  }

  const summary: PriceSummary = {
    rows,
    columns,
    lastClose: undefined,
    changeAbs: undefined,
    changePct: undefined,
    low52: undefined,
    high52: undefined,
    avgVolume3M: undefined,
    firstDate: undefined,
    lastDate: undefined
  }
  if (rows.length === 0) return summary

  const closeColumn = columns.close ?? columns.adjClose
  const last = rows[rows.length - 1]
  const previous = rows[rows.length - 2]

  if (closeColumn !== undefined) {
    summary.lastClose = num(last, closeColumn)
    const prior = num(previous, closeColumn)

    if (summary.lastClose !== undefined && prior !== undefined && prior !== 0) {
      summary.changeAbs = summary.lastClose - prior
      summary.changePct = (summary.changeAbs / prior) * 100
    }

    // 52 weeks of trading days, not calendar days — the frame is indexed by
    // session, so counting rows is the honest window.
    const window = rows.slice(-TRADING_DAYS_YEAR)
    const highs = window
      .map((row) => num(row, columns.high ?? closeColumn))
      .filter((value): value is number => value !== undefined)
    const lows = window
      .map((row) => num(row, columns.low ?? closeColumn))
      .filter((value): value is number => value !== undefined)

    if (highs.length > 0) summary.high52 = Math.max(...highs)
    if (lows.length > 0) summary.low52 = Math.min(...lows)
  }

  const volumeColumn = columns.volume
  if (volumeColumn !== undefined) {
    const volumes = rows
      .slice(-TRADING_DAYS_3M)
      .map((row) => num(row, volumeColumn))
      .filter((value): value is number => value !== undefined)
    if (volumes.length > 0) {
      summary.avgVolume3M = volumes.reduce((total, value) => total + value, 0) / volumes.length
    }
  }

  summary.firstDate = isoDate(rows[0]?.index)
  summary.lastDate = isoDate(last?.index)

  return summary
}

/** 58,412,000 → "58.4M". Volumes are unreadable at full precision. */
export function compactVolume(value: number | undefined): string {
  if (value === undefined) return '—'
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`
  return String(Math.round(value))
}

export function price(value: number | undefined, dp = 2): string {
  return value === undefined ? '—' : value.toFixed(dp)
}

export function signedPercent(value: number | undefined, dp = 2): string {
  if (value === undefined) return '—'
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(dp)}%`
}
