import type { components } from '@shared/api.generated'
import type { TableFrame } from '../../api/frame'

export type TablePage = components['schemas']['TablePage']

/**
 * `debt_to_equity` → "Debt to equity", `pe_ratio` → "Pe ratio".
 *
 * Same treatment the universe builder gives a reference column, and the same
 * reason: these are engine field names, and the app should not carry a
 * translation table that goes stale the moment a dataset gains a field.
 */
export function fieldLabel(field: string): string {
  const spaced = field.replace(/[_-]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * A ratio and a page-view count want different precision, and the engine
 * publishes no format. Magnitude is the only signal available: anything under
 * a thousand reads as a ratio, anything above as a count.
 */
export function featureValue(value: number | null): string {
  if (value === null) return '—'
  if (Number.isInteger(value)) return value.toLocaleString('en-US')
  if (Math.abs(value) >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return value.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

export interface FeatureHistoryRow {
  key: string
  date: string
  dataset: string
  field: string
  value: number | null
  detail: string | undefined
}

/**
 * Feature history, from the stored table (BU-113).
 *
 * `/data/tables/features` holds every value ever published — IDENTIFIER,
 * DATE, TYPE, FIELD, VALUE, DETAIL — where `/data/features/{identifier}`
 * answers point-in-time with one value per field. Prices and Corporate
 * Actions show a series, and there was no reason this should not.
 *
 * Newest first, because the current value is what anyone opens this to read
 * and the history is what they scroll for.
 */
export function historyRows(page: TablePage | undefined): FeatureHistoryRow[] {
  // The generated type calls `rows` an open object — py-beacon documents it
  // as "the {index, columns, data} frame shape used elsewhere", which is
  // exactly `TableFrame`.
  const frame = page?.rows as TableFrame | undefined
  if (frame === undefined) return []

  const at = (name: string): number => frame.columns.indexOf(name)
  const dateAt = at('DATE')
  const typeAt = at('TYPE')
  const fieldAt = at('FIELD')
  const valueAt = at('VALUE')
  const detailAt = at('DETAIL')

  const rows = frame.data.map((cells, position) => {
    const raw = cells[dateAt]
    const value = cells[valueAt]
    return {
      key: String(position),
      date: typeof raw === 'string' ? raw.slice(0, 10) : '—',
      dataset: typeof cells[typeAt] === 'string' ? cells[typeAt] : '—',
      field: typeof cells[fieldAt] === 'string' ? cells[fieldAt] : '—',
      value: typeof value === 'number' && Number.isFinite(value) ? value : null,
      detail: typeof cells[detailAt] === 'string' ? cells[detailAt] : undefined
    }
  })

  // Sorted here rather than assumed: the endpoint documents a page of a
  // stored table, not an order.
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.field.localeCompare(b.field))
}

/** The distinct fields present, for the row filter. */
export function fieldsIn(rows: readonly FeatureHistoryRow[]): string[] {
  return [...new Set(rows.map((row) => row.field))].sort((a, b) => a.localeCompare(b))
}

/**
 * Rows inside a date window, either end optional.
 *
 * Applied here rather than in the request because `/data/tables/{dataset}`
 * takes only offset, limit and identifiers — and one instrument's history is
 * a few hundred rows, so one fetch serves every range the user tries.
 */
export function within(
  rows: readonly FeatureHistoryRow[],
  from: string,
  to: string
): FeatureHistoryRow[] {
  return rows.filter((row) => {
    if (from !== '' && row.date < from) return false
    if (to !== '' && row.date > to) return false
    return true
  })
}
