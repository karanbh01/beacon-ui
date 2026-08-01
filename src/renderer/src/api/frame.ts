/**
 * py-beacon sends DataFrames row-oriented:
 *
 *   { index: [...], columns: ["open", "high", ...], data: [[...], ...] }
 *
 * Compact and order-preserving on the wire, but awkward to render. These
 * helpers turn one into records once, at the edge, so no view indexes into
 * `data[i][j]` and no view has to know the column order.
 */

export interface TableFrame {
  index: unknown[]
  columns: string[]
  data: unknown[][]
}

export type FrameRow = Record<string, unknown> & { index: unknown }

/** Rows keyed by column name, with the frame's index preserved as `index`. */
export function toRows(frame: TableFrame | undefined): FrameRow[] {
  if (frame === undefined) return []

  return frame.data.map((values, rowIndex) => {
    const row: FrameRow = { index: frame.index[rowIndex] }
    frame.columns.forEach((column, columnIndex) => {
      row[column] = values[columnIndex]
    })
    return row
  })
}

/**
 * Read a numeric cell.
 *
 * NaN arrives as null (py-beacon documents this), and a missing column is
 * indistinguishable from a null value at the call site — both mean "no number
 * here", and both must render as a dash rather than NaN.
 */
export function num(row: FrameRow | undefined, column: string): number | undefined {
  const value = row?.[column]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Case-insensitive column lookup — py-beacon may capitalise differently. */
export function findColumn(frame: TableFrame | undefined, ...names: string[]): string | undefined {
  if (frame === undefined) return undefined
  for (const name of names) {
    const match = frame.columns.find((column) => column.toLowerCase() === name.toLowerCase())
    if (match !== undefined) return match
  }
  return undefined
}
