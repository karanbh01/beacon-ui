import type { CSSProperties } from 'react'
import type { Column } from './Table'

/** Neighbouring columns under one group heading, or under none. */
export interface GroupRun<T> {
  key: string
  label: string | undefined
  columns: Column<T>[]
}

export function groupRuns<T>(columns: readonly Column<T>[]): GroupRun<T>[] {
  const runs: GroupRun<T>[] = []
  for (const column of columns) {
    const last = runs[runs.length - 1]
    if (last !== undefined && column.group !== undefined && last.label === column.group) {
      last.columns.push(column)
      continue
    }
    runs.push({ key: column.key, label: column.group, columns: [column] })
  }
  return runs
}

/** A group heading spans its columns and the gaps between them. */
export function groupStyle<T>(run: GroupRun<T>, fill: boolean): CSSProperties {
  const gaps = (run.columns.length - 1) * 10
  const width = run.columns.reduce((sum, column) => sum + column.width, 0) + gaps
  if (!fill) return { width }
  const min = run.columns.reduce((sum, column) => sum + (column.minWidth ?? column.width), 0)
  return { flexGrow: width, flexShrink: 0, flexBasis: width, minWidth: min + gaps }
}

/**
 * The heading a row opens under: its group, where that differs from the row
 * before it's. Undefined for a row that carries on the group above it.
 */
export function headingAt<T>(
  rows: readonly T[],
  at: number,
  rowGroup: ((row: T) => string | undefined) | undefined
): string | undefined {
  const row = rows[at]
  if (rowGroup === undefined || row === undefined) return undefined
  const group = rowGroup(row)
  const before = rows[at - 1]
  if (group === undefined) return undefined
  return before === undefined || rowGroup(before) !== group ? group : undefined
}
