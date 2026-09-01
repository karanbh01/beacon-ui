import type { TableFrame } from '../../api/frame'

/**
 * The datasets a client can actually read row by row (BU-102).
 *
 * Not from `/data/coverage`, though it lists them: coverage says what the
 * engine HOLDS, and this is about what is addressable. There is no
 * whole-table endpoint, so every one of these is read per identifier — which
 * is also why `fx` is absent despite the generator writing six pairs, and why
 * a paged `/data/tables/{dataset}` is filed in docs/engine-requests.
 */
export type DatasetId = 'market' | 'reference' | 'corporate_actions' | 'features'

export interface DatasetSpec {
  id: DatasetId
  label: string
  /** What the rows are, for the footnote. */
  unit: string
}

export const DATASETS: readonly DatasetSpec[] = [
  { id: 'market', label: 'Market', unit: 'bars' },
  { id: 'reference', label: 'Reference', unit: 'fields' },
  { id: 'corporate_actions', label: 'Corporate actions', unit: 'actions' },
  { id: 'features', label: 'Features', unit: 'features' }
]

export interface RawRow {
  /** Stable within one response, which is all a table needs. */
  key: string
  cells: (string | number | boolean | null)[]
}

export interface RawTable {
  columns: string[]
  rows: RawRow[]
}

/**
 * Columns a dataset should not show, by dataset (BU-139).
 *
 * RATE is the FX dataset's column. On a market bar it is either empty or
 * meaningless, and a column that is never useful is worse than no column —
 * the reader has to work out for themselves that it is noise.
 */
const HIDDEN: Record<string, readonly string[]> = { market: ['RATE'] }

export function withoutHidden(dataset: string, table: RawTable): RawTable {
  const hidden = new Set((HIDDEN[dataset] ?? []).map((name) => name.toUpperCase()))
  if (hidden.size === 0) return table

  const keep = table.columns
    .map((name, index) => ({ name, index }))
    .filter((column) => !hidden.has(column.name.toUpperCase()))
  if (keep.length === table.columns.length) return table

  return {
    columns: keep.map((column) => column.name),
    rows: table.rows.map((row) => ({
      key: row.key,
      cells: keep.map((column) => row.cells[column.index] ?? null)
    }))
  }
}

/** A cell as it came, only trimmed of the midnight on a plain date. */
function cell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') {
    return /^\d{4}-\d{2}-\d{2}T00:00:00/.test(value) ? value.slice(0, 10) : value
  }
  return JSON.stringify(value)
}

/**
 * A py-beacon frame, exactly as sent.
 *
 * No column is renamed, reordered, dropped or rounded — that is the whole
 * point of the view. The index becomes a first column because it is data the
 * frame carries and hiding it would be shaping.
 */
export function fromFrame(frame: TableFrame | undefined, indexHeader = 'Index'): RawTable {
  if (frame === undefined) return { columns: [], rows: [] }

  return {
    columns: [indexHeader, ...frame.columns],
    rows: frame.data.map((values, row) => ({
      key: `${String(frame.index[row])}-${String(row)}`,
      cells: [cell(frame.index[row]), ...values.map(cell)]
    }))
  }
}

/** A list of records — reference, features — as it came. */
export function fromRecords(records: readonly Record<string, unknown>[]): RawTable {
  const columns: string[] = []
  for (const record of records) {
    for (const key of Object.keys(record)) if (!columns.includes(key)) columns.push(key)
  }

  return {
    columns,
    rows: records.map((record, row) => ({
      key: String(row),
      cells: columns.map((column) => cell(record[column]))
    }))
  }
}

/** One record as name/value rows, for a dataset that holds a single row. */
export function asPairs(record: Record<string, unknown> | undefined): RawTable {
  if (record === undefined) return { columns: [], rows: [] }

  return {
    columns: ['Column', 'Value'],
    rows: Object.entries(record).map(([column, value]) => ({
      key: column,
      cells: [column, cell(value)]
    }))
  }
}

/** Right-align numbers, as every other table in the app does. */
export function isNumericColumn(table: RawTable, index: number): boolean {
  const seen = table.rows.map((row) => row.cells[index]).filter((value) => value !== null)
  return seen.length > 0 && seen.every((value) => typeof value === 'number')
}

/**
 * A filter expression, as typed into a column (BU-138).
 *
 * Text contains; numbers compare. `>100` and `<=0` mean what they look like,
 * a bare number on a numeric column means equals, and anything else is a
 * case-insensitive substring — which is what a spreadsheet's filter box does
 * and what a reader will expect without being told.
 */
const COMPARISON = /^(>=|<=|>|<|=)\s*(-?\d+(?:\.\d+)?)$/

export function matchesFilter(cell: string | number | boolean | null, expression: string): boolean {
  const wanted = expression.trim()
  if (wanted === '') return true

  const comparison = COMPARISON.exec(wanted)
  if (comparison !== null && typeof cell === 'number') {
    const value = Number(comparison[2])
    switch (comparison[1]) {
      case '>':
        return cell > value
      case '<':
        return cell < value
      case '>=':
        return cell >= value
      case '<=':
        return cell <= value
      default:
        return cell === value
    }
  }

  // A comparison against a cell that is not a number matches nothing, rather
  // than falling through to a substring search for ">100".
  if (comparison !== null) return false

  return String(cell ?? '')
    .toLowerCase()
    .includes(wanted.toLowerCase())
}

/** Every filter has to pass: they narrow, they do not compete. */
export function applyFilters(table: RawTable, filters: Record<string, string>): RawTable {
  const active = table.columns
    .map((name, index) => ({ index, expression: filters[name] ?? '' }))
    .filter((column) => column.expression.trim() !== '')

  if (active.length === 0) return table

  return {
    columns: table.columns,
    rows: table.rows.filter((row) =>
      active.every((column) => matchesFilter(row.cells[column.index] ?? null, column.expression))
    )
  }
}
