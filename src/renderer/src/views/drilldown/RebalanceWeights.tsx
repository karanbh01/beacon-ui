import type { ReactElement } from 'react'
import { Table, type Column } from '../../components/Table/Table'
import { dayOf, numberIn, type Part, type ProfileRow } from './profile'

/** How many of the latest rebalances the table has room for under the chart (Karan, 2026-11-27). */
const REBALANCES = 5
/** The row that says OW or UW for the active weight above it. */
const TOKEN = 'token'

interface WeightRow {
  id: string
  label: string
}

/**
 * Under the chart, on every face (Karan, 2026-11-27): the name's weight in
 * each portfolio at the latest rebalances, oldest on the left, the fund's
 * active weight, and under it OW or UW, green over and red under as the
 * token beside the name. Each is the engine's daily weight on the
 * rebalance's day.
 */
export function RebalanceWeights({
  daily,
  rebalances,
  benchmarkIsIndex
}: {
  daily: Part | undefined
  /** The run's rebalance days, from the profile's `rebalance_weights`. */
  rebalances: readonly string[]
  benchmarkIsIndex: boolean
}): ReactElement | null {
  const days = new Map((daily?.rows ?? []).map((row) => [row.date, row]))
  const shown = rebalances.slice(-REBALANCES).filter((date) => days.has(date))
  if (daily === undefined || shown.length === 0) return null
  const rows: WeightRow[] = [
    ...daily.columns
      .filter((column) => !(benchmarkIsIndex && column.name === 'benchmark'))
      .map((column) => ({
        id: column.name,
        label: `${column.name === 'index' && benchmarkIsIndex ? 'Index/BM' : column.label} weight`
      })),
    { id: TOKEN, label: 'OW/UW' }
  ]
  const columns: Column<WeightRow>[] = [
    { key: 'label', header: '', width: 110, rowName: true, render: (row) => row.label },
    ...shown.map((date): Column<WeightRow> => ({
      key: date,
      header: dayOf(date),
      group: 'Rebalance',
      width: 72,
      align: 'right',
      render: (row) => weightIn(days.get(date), row.id)
    }))
  ]
  return (
    <Table
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      className="drilldown-rebalances"
    />
  )
}

function weightIn(day: ProfileRow | undefined, row: string): ReactElement {
  const value = numberIn(day, row === TOKEN ? 'active' : row)
  if (value === undefined) return <span className="drilldown-faint">—</span>
  if (row === TOKEN) {
    if (value === 0) return <span className="drilldown-faint">—</span>
    return value > 0 ? (
      <span className="active-token is-over">OW</span>
    ) : (
      <span className="active-token is-under">UW</span>
    )
  }
  const percent = `${(value * 100).toFixed(2)}%`
  if (row !== 'active' || value === 0) return <span className="report-figure">{percent}</span>
  return (
    <span className={value > 0 ? 'report-figure is-overweight' : 'report-figure is-underweight'}>
      {`+${percent}`.replace('+-', '-')}
    </span>
  )
}
