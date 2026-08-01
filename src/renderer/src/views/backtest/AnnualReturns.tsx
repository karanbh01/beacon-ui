import type { ReactElement } from 'react'
import { Card } from '../../components/Card/Card'
import { Table, type Column } from '../../components/Table/Table'
import { signedPercent, type AnnualRow } from './backtest'
import './AnnualReturns.css'

export interface AnnualReturnsProps {
  rows: readonly AnnualRow[]
  indexId: string
  benchmarkId?: string | undefined
}

function tone(value: number | undefined): string {
  if (value === undefined || value === 0) return 'tone-default'
  return value > 0 ? 'tone-positive' : 'tone-negative'
}

function signed(value: number | undefined): ReactElement {
  return <span className={tone(value)}>{signedPercent(value)}</span>
}

/**
 * Figma 354:11673.
 *
 * Derived from the level series rather than requested: `BacktestMetrics`
 * carries whole-period figures only, and the series the engine already sent
 * contains every calendar year in it.
 */
export function AnnualReturns({ rows, indexId, benchmarkId }: AnnualReturnsProps): ReactElement {
  const columns: Column<AnnualRow>[] = [
    { key: 'year', header: 'Year', width: 70, emphasis: true, render: (row) => row.year },
    {
      key: 'index',
      header: indexId,
      width: 90,
      align: 'right',
      render: (row) => signed(row.index)
    }
  ]

  if (benchmarkId !== undefined) {
    columns.push(
      {
        key: 'benchmark',
        header: benchmarkId,
        width: 100,
        align: 'right',
        render: (row) => signed(row.benchmark)
      },
      {
        key: 'excess',
        header: 'Excess',
        width: 90,
        align: 'right',
        render: (row) => signed(row.excess)
      }
    )
  }

  return (
    <Card title="Annual returns" flush className="annual-returns">
      <Table columns={columns} rows={rows} getRowId={(row) => row.year} maxBodyHeight={300} />
    </Card>
  )
}
