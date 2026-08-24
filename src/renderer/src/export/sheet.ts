/**
 * Turning a table into a file (BU-106).
 *
 * The rows are already in the renderer, so an export is a serialiser and a
 * save dialog — not a request. Kept apart from the button so the shaping is
 * testable without a DOM.
 */

export type Cell = string | number | boolean | null | undefined

export interface Sheet {
  /** Column headers, in order. */
  columns: readonly string[]
  /** One array per row, aligned to `columns`. */
  rows: readonly (readonly Cell[])[]
  /** Sheet name in a workbook, and the basis for the file name. */
  name: string
}

/**
 * RFC 4180 quoting.
 *
 * A field is quoted when it holds a comma, a quote or a newline, and an
 * embedded quote is doubled. Company names carry commas — "Alpha Corp, Inc."
 * — so this is the common case rather than the edge one.
 */
function csvCell(value: Cell): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (!/[",\r\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

/**
 * CRLF line endings, which is what RFC 4180 says and what Excel expects on
 * Windows. A BOM so Excel reads it as UTF-8 rather than the local codepage —
 * without it, any non-ASCII company name opens mangled.
 */
export function toCsv(sheet: Sheet): string {
  const lines = [sheet.columns.map(csvCell).join(',')]
  for (const row of sheet.rows) lines.push(row.map(csvCell).join(','))
  return `\ufeff${lines.join('\r\n')}\r\n`
}

/** What `write-excel-file` takes: a grid of typed cells, header row first. */
export function toWorkbookRows(sheet: Sheet): { value: Cell; type?: unknown }[][] {
  const header = sheet.columns.map((column) => ({ value: column, fontWeight: 'bold' as const }))
  const body = sheet.rows.map((row) =>
    row.map((cell) => {
      // Typed, not stringified: a number written as text sorts and sums
      // wrongly in Excel, which is most of the reason to want xlsx at all.
      if (typeof cell === 'number' && Number.isFinite(cell)) return { value: cell, type: Number }
      if (typeof cell === 'boolean') return { value: cell, type: Boolean }
      if (cell === null || cell === undefined) return { value: null }
      return { value: String(cell), type: String }
    })
  )
  return [header, ...body]
}

/** `Prices · CMP000` → `prices-cmp000`. Safe on every filesystem we target. */
export function fileStem(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'export' : slug
}

/**
 * A frame straight to a sheet.
 *
 * The engine's own columns, not the table's: an export is for the numbers,
 * and the display table drops columns it has no place for and rounds the ones
 * it keeps. Someone exporting wants what the engine sent.
 */
export function sheetFromFrame(
  frame: { index: unknown[]; columns: string[]; data: unknown[][] } | undefined,
  name: string,
  indexHeader = 'Date'
): Sheet {
  if (frame === undefined) return { columns: [indexHeader], rows: [], name }

  return {
    name,
    columns: [indexHeader, ...frame.columns],
    rows: frame.data.map((values, row) => [
      asCell(frame.index[row]),
      ...values.map((value) => asCell(value))
    ])
  }
}

function asCell(value: unknown): Cell {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') {
    // Dates arrive as "2026-08-19T00:00:00"; the time is noise in a sheet.
    return /^\d{4}-\d{2}-\d{2}T00:00:00/.test(value) ? value.slice(0, 10) : value
  }
  // Anything else is a nested structure the wire format does not promise.
  // Serialised rather than String()'d, which would write [object Object].
  return JSON.stringify(value)
}
