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
/**
 * A frame as a table.
 *
 * `indexHeader` names the frame's index as a first column. Omit it where the
 * index carries nothing — the table endpoint resets its frames before paging,
 * so its index is a row counter and a column of those is noise (BU-149).
 */
export function fromFrame(frame: TableFrame | undefined, indexHeader?: string): RawTable {
  if (frame === undefined) return { columns: [], rows: [] }
  if (indexHeader === undefined) {
    return {
      columns: [...frame.columns],
      rows: frame.data.map((values, row) => ({
        key: `${String(frame.index[row])}-${String(row)}`,
        cells: values.map(cell)
      }))
    }
  }

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

/**
 * What a column's menu is currently asking for (BU-148).
 *
 * All optional: a column nobody has touched carries an empty object, which
 * is what makes "is anything filtering?" a cheap question.
 */
export interface ColumnQuery {
  /** Text contains, or a comparison — see `matchesFilter`. */
  filter?: string
  /** Inclusive, on a date column. Either end alone is a bound. */
  from?: string
  to?: string
  sort?: 'asc' | 'desc'
}

export type ColumnQueries = Record<string, ColumnQuery>

/** py-beacon names date columns plainly, and they are the ones worth ranging. */
export function isDateColumn(name: string): boolean {
  return /(^|_)date(_|$)|_date$|^date/i.test(name)
}

/** The ten characters of an ISO date, from whatever the cell holds. */
function isoDate(cell: string | number | boolean | null): string {
  return typeof cell === 'string' ? cell.slice(0, 10) : ''
}

function inRange(cell: string | number | boolean | null, from: string, to: string): boolean {
  const date = isoDate(cell)
  if (date === '') return false
  if (from !== '' && date < from) return false
  if (to !== '' && date > to) return false
  return true
}

/** Does this cell satisfy everything the column's menu is asking? */
export function matchesQuery(cell: string | number | boolean | null, query: ColumnQuery): boolean {
  const from = query.from ?? ''
  const to = query.to ?? ''
  if ((from !== '' || to !== '') && !inRange(cell, from, to)) return false
  return matchesFilter(cell, query.filter ?? '')
}

/** True when a column is narrowing anything, which is not the same as sorting. */
export function isNarrowing(query: ColumnQuery | undefined): boolean {
  if (query === undefined) return false
  return (query.filter ?? '').trim() !== '' || (query.from ?? '') !== '' || (query.to ?? '') !== ''
}

/**
 * Narrow and order a page (BU-148).
 *
 * One sort at a time: the first column asking for one wins, because two
 * competing orders on a page of a million-row table is a question nobody
 * asked and a rule nobody could predict.
 */
export function applyQueries(table: RawTable, queries: ColumnQueries): RawTable {
  const columns = table.columns.map((name, index) => ({ name, index, query: queries[name] ?? {} }))
  const narrowing = columns.filter((column) => isNarrowing(column.query))

  const rows =
    narrowing.length === 0
      ? table.rows
      : table.rows.filter((row) =>
          narrowing.every((column) => matchesQuery(row.cells[column.index] ?? null, column.query))
        )

  const sorted = columns.find((column) => column.query.sort !== undefined)
  if (sorted === undefined) return narrowing.length === 0 ? table : { columns: table.columns, rows }

  const direction = sorted.query.sort === 'desc' ? -1 : 1
  const ordered = [...rows].sort((a, b) => {
    const left = a.cells[sorted.index] ?? null
    const right = b.cells[sorted.index] ?? null
    // Nulls last whichever way the column is sorted: they are the absence of
    // a value, not the smallest one.
    if (left === null) return right === null ? 0 : 1
    if (right === null) return -1
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction
    return String(left).localeCompare(String(right)) * direction
  })

  return { columns: table.columns, rows: ordered }
}

/**
 * A number as it should READ, which is not always as it was sent (BU-149).
 *
 * This view renames nothing, reorders nothing and drops nothing — but
 * `157.47000000000003` beside `156.85` is the float that produced it rather
 * than the price it means, and the two have to look alike to be compared.
 * Rounding is a display decision and stops here: the export writes what the
 * engine sent.
 */
const MAX_DECIMALS = 4

export function readNumber(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString('en-US')
  return String(Number(value.toFixed(MAX_DECIMALS)))
}
