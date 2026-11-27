import { useMemo, useState, type ReactElement } from 'react'
import type { AnalysisOptions, Analytics, TableFrame } from '../../../api/analytics'
import { LevelChart, type Series } from '../../../charts/LevelChart'
import { Select } from '../../../components/Select/Select'
import { Table, type Column } from '../../../components/Table/Table'
import { useThemeMode } from '../../../state/theme'
import { figureLabel, formatValue, isSigned, portfolioName, toneOf } from './analyticsFormat'
import type { LaidOutStatistic } from './reportLayout'

const BOOKS = ['fund', 'index', 'benchmark', 'active']

interface FigureRow {
  id: string
  label: string
  values: Record<string, number | null>
  unit: LaidOutStatistic['spec']['unit']
  decimals: number
  signed: boolean
  /** Why it could not be worked out, shown in its row. */
  missing?: string
}

/**
 * A section's figures as one table, as py-beacon sets a statistics table:
 * the statistics down, the books across. A book shows once any statistic in
 * the section has it, so a run with no benchmark has no Benchmark column.
 */
export function FiguresTable({
  statistics,
  analytics,
  options
}: {
  statistics: readonly LaidOutStatistic[]
  analytics: Analytics
  options: AnalysisOptions
}): ReactElement {
  const rows: FigureRow[] = statistics.map(({ spec }) => {
    const value = analytics.statistics[spec.id]
    const missing = analytics.unavailable[spec.id]
    return {
      id: spec.id,
      label: spec.label,
      values: value?.kind === 'figures' ? value.point : {},
      unit: spec.unit,
      decimals: spec.decimals,
      signed: isSigned(spec),
      ...(missing === undefined ? {} : { missing: missing.reason })
    }
  })
  const books = BOOKS.filter((book) => rows.some((row) => row.values[book] != null))
  const columns: Column<FigureRow>[] = [
    {
      key: 'statistic',
      header: 'Statistic',
      width: 230,
      rowName: true,
      render: (row) => row.label
    },
    ...books.map((book): Column<FigureRow> => ({
      key: book,
      header: portfolioName(book, options.names),
      width: 110,
      align: 'right',
      render: (row) => {
        if (row.missing !== undefined) {
          return book === books[0] ? <span className="report-missing">{row.missing}</span> : null
        }
        const value = row.values[book]
        return (
          <span className={`report-figure ${row.signed ? toneOf(value, row.unit) : ''}`}>
            {value === undefined ? '' : formatValue(value, row.unit, row.decimals)}
          </span>
        )
      }
    }))
  ]
  return <Table columns={columns} rows={rows} getRowId={(row) => row.id} />
}

/** A statistic whose figures have compound names, such as VaR by method, level and horizon. */
export function CompoundFigures({
  item,
  analytics,
  options
}: {
  item: LaidOutStatistic
  analytics: Analytics
  options: AnalysisOptions
}): ReactElement {
  const value = analytics.statistics[item.spec.id]
  const point = value?.kind === 'figures' ? value.point : {}
  const rows = Object.entries(point).map(([name, figure]) => ({ name, figure }))
  return (
    <Table
      columns={[
        {
          key: 'name',
          header: item.spec.label,
          width: 230,
          rowName: true,
          render: (row) => figureLabel(row.name, item.spec, options.names)
        },
        {
          key: 'value',
          header: 'Value',
          width: 110,
          align: 'right',
          render: (row) => formatValue(row.figure, item.spec.unit, item.spec.decimals)
        }
      ]}
      rows={rows}
      getRowId={(row) => row.name}
    />
  )
}

/** A table statistic, its columns labelled and formatted from the catalogue. */
export function StatisticTable({
  item,
  analytics
}: {
  item: LaidOutStatistic
  analytics: Analytics
}): ReactElement {
  const value = analytics.statistics[item.spec.id]
  const frame: TableFrame | undefined = value?.kind === 'table' ? value.point : undefined
  const specs = item.spec.columns ?? []
  const signed = isSigned(item.spec)
  const rows = (frame?.data ?? []).map((cells, at) => ({ at, cells }))
  const columns: Column<{ at: number; cells: (string | number | boolean | null)[] }>[] = (
    frame?.columns ?? []
  ).map((name, position) => {
    const spec = specs.find((candidate) => candidate.name === name)
    return {
      key: name,
      header: spec?.label ?? name,
      width: position === 0 ? 200 : 120,
      align: position === 0 ? 'left' : 'right',
      ...(position === 0 ? { emphasis: true } : {}),
      render: (row) => {
        const cell = row.cells[position]
        const unit = spec?.unit ?? null
        return (
          <span className={`report-figure ${signed ? toneOf(cell, unit) : ''}`}>
            {formatValue(cell, unit, unit === 'fraction' ? 4 : 2)}
          </span>
        )
      }
    }
  })
  return <Table columns={columns} rows={rows} getRowId={(row) => String(row.at)} />
}

/**
 * The section's rolling figures, one at a time: a chart of the statistic
 * over its trailing window, a line per book. One chart with a choice reads
 * better than a stack of them (as Risk & Correlation's series did).
 */
export function RollingChart({
  statistics,
  analytics,
  options
}: {
  statistics: readonly LaidOutStatistic[]
  analytics: Analytics
  options: AnalysisOptions
}): ReactElement | null {
  const mode = useThemeMode()
  const rolling = statistics.filter(({ spec, entry }) => {
    const value = analytics.statistics[spec.id]
    return entry.view !== 'point' && value?.kind === 'figures' && value.rolling !== undefined
  })
  const [chosen, setChosen] = useState(rolling[0]?.spec.id ?? '')
  const shown = rolling.find(({ spec }) => spec.id === chosen) ?? rolling[0]
  const series = useMemo((): Series[] => {
    if (shown === undefined) return []
    const value = analytics.statistics[shown.spec.id]
    if (value?.kind !== 'figures' || value.rolling === undefined) return []
    const { table } = value.rolling
    const scale = shown.spec.unit === 'fraction' ? 100 : 1
    return table.columns.map((column, at) => ({
      label: portfolioName(column, options.names),
      points: table.index.map((date, row) => ({
        date: String(date),
        value: Number(table.data[row]?.[at] ?? 0) * scale
      }))
    }))
  }, [shown, analytics, options])
  if (shown === undefined) return null
  const window = analytics.statistics[shown.spec.id]
  const days = window?.kind === 'figures' ? window.rolling?.window : undefined
  return (
    <div className="report-rolling">
      <div className="report-rolling-head">
        <Select
          label="Rolling statistic"
          options={rolling.map(({ spec }) => ({ value: spec.id, label: spec.label }))}
          value={shown.spec.id}
          onChange={setChosen}
        />
        <span className="report-rolling-note type-11">
          Rolling over {days === undefined ? 'a trailing window' : `${String(days)} trading days`}
        </span>
      </div>
      <LevelChart mode={mode} series={series} height={220} />
    </div>
  )
}
