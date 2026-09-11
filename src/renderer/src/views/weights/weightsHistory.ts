import type { components } from '@shared/api.generated'
import { bucketOf } from '../shared/periods'

export type RebalanceSnapshot = components['schemas']['RebalanceSnapshot']
export type TableFrame = components['schemas']['TableFrame']

/**
 * Weights over time, as a matrix (BU-177).
 *
 * Names down, dates across. Two sources, and which one answers depends on
 * what the reader asked — they are different facts, not two routes to one:
 *
 * - **By rebalance** reads `rebalances[]`: the composition the index
 *   DECIDED on each rebalance date.
 * - **Monthly, quarterly** resample the daily panel: what the index
 *   actually HELD on that date, drift and all.
 *
 * They differ everywhere except on a rebalance date itself, so the control
 * names them rather than offering a frequency list that quietly changes the
 * meaning of every cell.
 */
export type Frequency = 'rebalance' | 'monthly' | 'quarterly'

export const FREQUENCIES: readonly { value: Frequency; label: string }[] = [
  { value: 'rebalance', label: 'By rebalance' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' }
]

export interface MatrixRow {
  key: string
  /**
   * Weight on each date, aligned to `dates`.
   *
   * `undefined` means NOT HELD, which is not zero: "absent from the index"
   * and "in the index at 0.00%" are different facts, and a zero would lose
   * the difference. py-beacon's panel encodes it the same way.
   */
  cells: (number | undefined)[]
  /** Largest absolute weight across the row — what it sorts on. */
  peak: number
}

export interface WeightMatrix {
  dates: string[]
  rows: MatrixRow[]
  /**
   * What the engine served against what it holds.
   *
   * Both sources are bounded — the daily panel to its most recent dates,
   * the rebalance list to its most recent entries — and the failure mode is
   * quiet: a table that simply starts late. Present only when they differ.
   */
  truncation?: { served: number; total: number }
}

export const EMPTY: WeightMatrix = { dates: [], rows: [] }

/** The composition decided at each rebalance, oldest column first. */
export function fromSnapshots(
  snapshots: readonly RebalanceSnapshot[],
  total: number
): WeightMatrix {
  const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  const dates = ordered.map((snapshot) => snapshot.date.slice(0, 10))
  const columns = ordered.map((snapshot) => snapshot.weights)

  return build(dates, columns, snapshots.length, total)
}

/**
 * The daily panel, resampled to one column per bucket.
 *
 * The LAST date in each bucket, because a month-end weight is the weight at
 * the month's end. Taking the first would report what was held before the
 * month's trading rather than after it.
 */
export function fromPanel(
  frame: TableFrame | undefined,
  total: number,
  frequency: 'monthly' | 'quarterly'
): WeightMatrix {
  if (frame === undefined) return EMPTY

  const chosen = new Map<string, number>()
  frame.index.forEach((label, row) => {
    if (typeof label !== 'string') return
    chosen.set(bucketOf(label.slice(0, 10), frequency), row)
  })

  const rows = [...chosen.values()].sort((a, b) => a - b)
  const dates = rows.map((row) => String(frame.index[row]).slice(0, 10))
  const columns = rows.map((row) => weightsIn(frame, row))

  return build(dates, columns, frame.index.length, total)
}

/** One row's weights as an identifier → weight map, skipping the blanks. */
function weightsIn(frame: TableFrame, row: number): Record<string, number> {
  const weights: Record<string, number> = {}
  const values = frame.data[row] ?? []

  frame.columns.forEach((identifier, column) => {
    const value = values[column]
    // Null is "not held on this date", which is why it is skipped rather
    // than written as zero (NaN arrives as null, per TableFrame).
    if (typeof value === 'number' && Number.isFinite(value)) weights[identifier] = value
  })
  return weights
}

function build(
  dates: string[],
  columns: readonly Record<string, number>[],
  served: number,
  total: number
): WeightMatrix {
  const names = new Set<string>()
  for (const column of columns) {
    for (const name of Object.keys(column)) names.add(name)
  }

  const rows = [...names].map((key) => {
    const cells = columns.map((column) => column[key])
    return { key, cells, peak: peakOf(cells) }
  })

  return {
    dates,
    rows: rows.sort(byPeak),
    ...(total > served ? { truncation: { served, total } } : {})
  }
}

function peakOf(cells: readonly (number | undefined)[]): number {
  return cells.reduce<number>((most, cell) => Math.max(most, Math.abs(cell ?? 0)), 0)
}

/** Heaviest first, then by name so the order is stable between renders. */
function byPeak(a: MatrixRow, b: MatrixRow): number {
  return b.peak - a.peak || a.key.localeCompare(b.key)
}

/**
 * Roll the rows up by a descriptive field.
 *
 * A group's weight is the sum of its members', so the column totals are
 * unchanged — an aggregation that did not preserve them would be a
 * different index. A name with no value for the field lands in one bucket
 * of its own rather than being dropped: dropping it would change the total
 * and hide the gap in the reference data that caused it.
 */
export function aggregateBy(
  matrix: WeightMatrix,
  groupOf: (identifier: string) => string
): WeightMatrix {
  const groups = new Map<string, (number | undefined)[]>()

  for (const row of matrix.rows) {
    const group = groupOf(row.key)
    const totals = groups.get(group) ?? matrix.dates.map(() => undefined)

    row.cells.forEach((cell, at) => {
      if (cell === undefined) return
      totals[at] = (totals[at] ?? 0) + cell
    })
    groups.set(group, totals)
  }

  const rows = [...groups].map(([key, cells]) => ({ key, cells, peak: peakOf(cells) }))
  return { ...matrix, rows: rows.sort(byPeak) }
}

/**
 * This index's weights minus a benchmark's, on the index's own dates.
 *
 * Absence means zero HERE, and only here: an active weight asks "how much
 * more of this than the benchmark", and a name the benchmark holds and this
 * index does not is a real underweight rather than a blank. That is the
 * opposite of the rule elsewhere in this file, and the difference is the
 * question being asked, not an inconsistency.
 *
 * A date the benchmark has no column for is left undefined across the
 * board: no benchmark on that date means no active weight on that date, and
 * reporting the index's own weight as though it were active would overstate
 * every position by the benchmark's.
 */
export function activeAgainst(matrix: WeightMatrix, benchmark: WeightMatrix): WeightMatrix {
  const column = new Map(benchmark.dates.map((date, at) => [date, at]))
  const byName = new Map(benchmark.rows.map((row) => [row.key, row]))
  const names = new Set([...matrix.rows, ...benchmark.rows].map((row) => row.key))

  const mine = new Map(matrix.rows.map((row) => [row.key, row]))
  const rows = [...names].map((key) => {
    const cells = matrix.dates.map((date, at) => {
      const against = column.get(date)
      if (against === undefined) return undefined
      const held = mine.get(key)?.cells[at] ?? 0
      return held - (byName.get(key)?.cells[against] ?? 0)
    })
    return { key, cells, peak: peakOf(cells) }
  })

  return { ...matrix, rows: rows.sort(byPeak) }
}

/** Column sums, for the total row a weights table is checked against. */
export function columnTotals(matrix: WeightMatrix): (number | undefined)[] {
  return matrix.dates.map((_date, at) => {
    const cells = matrix.rows.map((row) => row.cells[at]).filter((cell) => cell !== undefined)
    return cells.length === 0 ? undefined : cells.reduce((sum, cell) => sum + cell, 0)
  })
}
