/**
 * py-beacon 0.10.0's analytics, as agreed (BN-398, BN-400; beacon-ui's two
 * reviews, 2026-10-29).
 *
 * Interim: written by hand from the agreed design so the views can be built
 * before the engine publishes these endpoints. When `spec:refresh` brings
 * them into the generated client, these types give way to the generated
 * ones and the shapes should already match.
 */

export type Unit = 'fraction' | 'ratio' | 'bps' | 'money' | 'count' | 'days' | 'years' | 'date'
export type TimeView = 'point' | 'rolling' | 'both'
export type Level = 'core' | 'extended'

export interface TableFrame {
  index: (string | number)[]
  columns: string[]
  data: (string | number | null)[][]
}

export interface ColumnSpec {
  name: string
  label: string
  unit: Unit | null
  /** Display labels for a coded text column's values. */
  labels?: Record<string, string>
}

export interface StatisticSpec {
  id: string
  label: string
  category: string
  kind: 'figures' | 'series' | 'table'
  unit: Unit | null
  part: string
  decimals: number
  description: string
  rolling: { cost: string; step: string } | null
  columns?: ColumnSpec[]
  /** The dimensions a compound figure name is made of, in order. */
  figure_names?: string[]
  settings?: string[]
}

export interface ReportEntry {
  id: string
  state: 'included' | 'optional'
  view: TimeView
}

export interface ReportSection {
  label: string
  order: number
  statistics: ReportEntry[]
}

export interface ReportSpec {
  id: string
  label: string
  order: number
  levels: Record<Level, { sections: ReportSection[] }>
}

export interface AnalysisOptions {
  settings: unknown[]
  statistics: StatisticSpec[]
  reports: ReportSpec[]
  names: Record<string, Record<string, string>>
  tables: { name: string; label: string; columns: ColumnSpec[] }[]
  unavailable: { code: string; label: string; help: string }[]
  renamed: Record<string, string>
  dropped: string[]
}

export interface RollingFigures {
  window: number
  step: string
  table: TableFrame
}

export type StatisticValue =
  | { kind: 'figures'; point: Record<string, number | null>; rolling?: RollingFigures }
  | { kind: 'table'; point: TableFrame; rolling?: RollingFigures }
  | { kind: 'series'; point: { index: string[]; name: string; data: (number | null)[] } }

export interface Analytics {
  request: Record<string, unknown>
  active_against: string
  reports: Record<string, { level: Level; statistics: { id: string; view: TimeView }[] }>
  statistics: Record<string, StatisticValue>
  unavailable: Record<string, { code: string; reason: string }>
  tables: Record<string, { rows: number; path: string }>
  timings: Record<string, number>
}

export type AnalyticsAnswer =
  | { status: 'computed'; analytics: Analytics }
  | { status: 'not_computed'; analytics: null; reason: string }

/** A large table in the by-column JSON: repeated text sent once with a code per row. */
export interface ByColumnTable {
  length: number
  columns: Record<string, (number | string | null)[] | { values: string[]; codes: number[] }>
  constant?: Record<string, unknown>
  decimals?: Record<string, number>
}

/** A by-column table as rows, each keyed by column name. */
export function tableRows(table: ByColumnTable): Record<string, unknown>[] {
  const columns = Object.entries(table.columns).map(([name, column]) => {
    if (Array.isArray(column)) return { name, at: (row: number) => column[row] ?? null }
    return { name, at: (row: number) => column.values[column.codes[row] ?? -1] ?? null }
  })
  const constant = table.constant ?? {}
  return Array.from({ length: table.length }, (_, row) => {
    const out: Record<string, unknown> = { ...constant }
    for (const column of columns) out[column.name] = column.at(row)
    return out
  })
}
