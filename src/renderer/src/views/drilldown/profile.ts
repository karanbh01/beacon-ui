import type { AssetView, InstrumentProfile, ProfileTable } from '../shared/beaconQueries'

/*
 * Reading a name's profile (py-beacon BN-468..474): every part a dated
 * table, its columns each with a label, a unit and, for codes, their labels.
 * The view reads parts by name and leaves alone any it does not know yet.
 */

export type Cell = string | number | boolean | null
export type ProfileColumn = ProfileTable['columns'][number]

export interface Part {
  columns: readonly ProfileColumn[]
  /** A row a date, each keyed by column name, with its date. */
  rows: readonly ProfileRow[]
}

export interface ProfileRow {
  date: string
  values: Record<string, Cell>
}

export type Period = 'month' | 'quarter' | 'year'

/** A part by name, its rows keyed; undefined when the run cannot give it. */
export function partOf(profile: InstrumentProfile | undefined, name: string): Part | undefined {
  const part = profile?.parts[name]
  if (part === undefined) return undefined
  return {
    columns: part.columns,
    rows: part.data.map((cells, at) => ({
      date: part.dates[at] ?? '',
      values: Object.fromEntries(
        part.columns.map((column, place) => [column.name, cellOf(cells[place])])
      )
    }))
  }
}

/** Why a part is missing, in the engine's words. */
export function missingOf(profile: InstrumentProfile | undefined, name: string): string {
  return profile?.unavailable[name] ?? 'Not worked out for this run.'
}

function cellOf(value: unknown): Cell {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : null
}

/** The latest row that says something for `name`. */
export function latestWith(part: Part | undefined, name: string): ProfileRow | undefined {
  return [...(part?.rows ?? [])].reverse().find((row) => (row.values[name] ?? null) !== null)
}

export function numberIn(row: ProfileRow | undefined, name: string): number | undefined {
  const value = row?.values[name]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function columnOf(part: Part | undefined, name: string): ProfileColumn | undefined {
  return part?.columns.find((column) => column.name === name)
}

/** Money in the portfolio's currency, short: USD 2.4bn, USD 310.5m, or a price or cost as it is. */
export function money(value: number, currency: string): string {
  const size = Math.abs(value)
  const prefix = currency === '' ? '' : `${currency} `
  if (size >= 1e12) return `${prefix}${(value / 1e12).toFixed(2)}tn`
  if (size >= 1e9) return `${prefix}${(value / 1e9).toFixed(1)}bn`
  if (size >= 1e6) return `${prefix}${(value / 1e6).toFixed(1)}m`
  return `${prefix}${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Spelled out rather than Intl's, which writes September "Sept" in en-GB.
export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]

/** A day as Drilldown writes every date (Karan, 2026-11-27): "6 Dec 2024". */
export function dayOf(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return iso
  return `${String(date.getUTCDate())} ${MONTHS[date.getUTCMonth()] ?? ''} ${String(date.getUTCFullYear())}`
}

/** A cell as the column's unit reads it; a code by its label; a dash for none. */
export function cellText(column: ProfileColumn | undefined, value: Cell, currency: string): string {
  if (value === null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' && column?.unit === 'date') return dayOf(value)
  if (typeof value === 'string') return column?.labels?.[value] ?? value
  if (!Number.isFinite(value)) return '—'
  switch (column?.unit) {
    case 'fraction':
      return `${(value * 100).toFixed(2)}%`
    case 'money':
      return money(value, currency)
    case 'days':
      return `${value.toFixed(1)} days`
    case 'count':
      return Math.round(value).toLocaleString('en-GB')
    case 'ratio':
      return value.toFixed(2)
    default:
      // A rule's value or threshold, in its own units: a market cap is large.
      return Math.abs(value) >= 1e6
        ? money(value, '')
        : value.toLocaleString('en-GB', { maximumFractionDigits: 2 })
  }
}

/** Positive green, negative red, for a column of returns or margins. */
export function signTone(value: Cell): string | undefined {
  if (typeof value !== 'number' || value === 0) return undefined
  return value > 0 ? 'drilldown-up' : 'drilldown-down'
}

/** An event's amount: the weight it was capped to or the margin it cleared a rule by, as a percentage; else as given. */
export function eventAmount(code: string, amount: number): string {
  if (code === 'capped' || code === 'near_miss') return `${(amount * 100).toFixed(1)}%`
  return amount.toFixed(2)
}

/**
 * What the asset view's numbers are in (BU-220, py-beacon 0.3.0).
 *
 * The returns are measured in the portfolio's currency (the index's before
 * 0.11.0) and the price in the name's own, so for a GBP name in a USD fund
 * the total return no longer matches where the price line ends: both are
 * labelled, or the two read as one number disagreeing with itself. A name
 * with no currency on record is priced as if in the portfolio's, which is
 * what the engine does with it. An engine before 0.3.0 says neither, and
 * nor does this: a guessed currency is worse than none.
 */
export function currenciesOf(asset: AssetView | undefined): { returns?: string; price?: string } {
  const returns = asset?.currency ?? undefined
  if (returns === undefined) return {}
  return { returns, price: asset?.price_currency ?? returns }
}

/** A currency as a label's suffix: " (USD)", or nothing when it is not known. */
export function inCurrency(currency: string | undefined): string {
  return currency === undefined ? '' : ` (${currency})`
}
