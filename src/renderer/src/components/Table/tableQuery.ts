/**
 * Sorting and filtering a results table in the app (Karan, 2026-10-19).
 *
 * The table already holds every row the engine sent, so a sort or a filter
 * is a view of them rather than a new question: nothing goes back to the
 * engine. A column takes part by saying what value it sorts and filters on,
 * in the units it shows (a weight shown as 12.00% is 12 here, so a range is
 * typed as the reader reads it).
 */

/** A column's value for sorting and filtering. Blank sorts last either way. */
export type CellValue = string | number | null | undefined

export interface ColumnFilter {
  /** Text the value must contain, for a free-text column. */
  text?: string
  /** Bounds, inclusive, for a number column. */
  min?: number
  max?: number
  /** The values to keep, for a column with few of them (a sector, a country). */
  values?: readonly string[]
}

export type SortDirection = 'asc' | 'desc'

export interface TableQuery {
  sort?: { key: string; direction: SortDirection }
  filters: Readonly<Record<string, ColumnFilter>>
}

export const NO_QUERY: TableQuery = { filters: {} }

/** A column with this few distinct values is filtered by ticking them, not typing. */
export const FEW_VALUES = 12

/** Whether a filter narrows anything: an empty one is no filter. */
export function narrows(filter: ColumnFilter | undefined): boolean {
  if (filter === undefined) return false
  return (
    (filter.text !== undefined && filter.text.trim() !== '') ||
    filter.min !== undefined ||
    filter.max !== undefined ||
    filter.values !== undefined
  )
}

export function isFiltered(query: TableQuery): boolean {
  return Object.values(query.filters).some(narrows)
}

/** The query with one column's filter replaced, or dropped when there is none. */
export function withFilter(
  query: TableQuery,
  key: string,
  filter: ColumnFilter | undefined
): TableQuery {
  const others = Object.fromEntries(Object.entries(query.filters).filter(([own]) => own !== key))
  return { ...query, filters: filter === undefined ? others : { ...others, [key]: filter } }
}

/** The query sorted by one column, or by none. */
export function withSort(
  query: TableQuery,
  key: string,
  direction: SortDirection | undefined
): TableQuery {
  return direction === undefined
    ? { filters: query.filters }
    : { ...query, sort: { key, direction } }
}

/** The value as the filter and the tick list read it. */
export function asText(value: CellValue): string {
  if (value === null || value === undefined || value === '') return '—'
  return typeof value === 'number' ? value.toLocaleString('en-US') : value
}

function passes(value: CellValue, filter: ColumnFilter): boolean {
  if (filter.values !== undefined && !filter.values.includes(asText(value))) return false
  const text = filter.text?.trim().toLowerCase()
  if (text !== undefined && text !== '' && !asText(value).toLowerCase().includes(text)) return false
  if (filter.min !== undefined || filter.max !== undefined) {
    if (typeof value !== 'number') return false
    if (filter.min !== undefined && value < filter.min) return false
    if (filter.max !== undefined && value > filter.max) return false
  }
  return true
}

function compare(one: CellValue, other: CellValue): number {
  const blankOne = one === null || one === undefined || one === ''
  const blankOther = other === null || other === undefined || other === ''
  if (blankOne || blankOther) return Number(blankOne) - Number(blankOther)
  if (typeof one === 'number' && typeof other === 'number') return one - other
  return String(one).localeCompare(String(other), 'en', { numeric: true })
}

/**
 * The rows the query keeps, in the order it asks for. Blanks sort last in
 * both directions: a missing value is not the smallest or the largest.
 */
export function applyQuery<T>(
  rows: readonly T[],
  valueOf: (key: string) => ((row: T) => CellValue) | undefined,
  query: TableQuery
): readonly T[] {
  const filters = Object.entries(query.filters).filter(([, filter]) => narrows(filter))
  const kept =
    filters.length === 0
      ? rows
      : rows.filter((row) =>
          filters.every(([key, filter]) => {
            const value = valueOf(key)
            return value === undefined || passes(value(row), filter)
          })
        )

  const sort = query.sort
  const value = sort === undefined ? undefined : valueOf(sort.key)
  if (sort === undefined || value === undefined) return kept

  const sign = sort.direction === 'asc' ? 1 : -1
  return [...kept].sort((one, other) => {
    const left = value(one)
    const right = value(other)
    const blanks = compare(left, right)
    const either = left === null || left === undefined || right === null || right === undefined
    return either ? blanks : sign * blanks
  })
}
