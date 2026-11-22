import { useMemo, useState, type ReactElement } from 'react'
import type { Analytics } from '../../api/analytics'
import { LevelChart, type Series } from '../../charts/LevelChart'
import { Table, type Column } from '../../components/Table/Table'
import { PercentCell } from '../../components/Table/cells'
import { ChevronIcon } from '../../icons/generated'
import type { ThemeMode } from '../../tokens/tokens'
import { signedPercent } from '../shared/indexMetrics'
import { frameOf, numberOf, reasonOf, recordsOf, textOf, type Cell } from './analyticsFrames'

interface CrisisRow {
  name: string
  start: string
  end: string
  status: string
  fund: number | undefined
  comparator: number | undefined
  outperformance: number | undefined
  drawdown: number | undefined
  recoveryDays: number | undefined
  recoveryDate: string | undefined
}

const STATUS: Record<string, string> = {
  before_run: 'Before the run',
  after_run: 'After the run'
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CHART_HEIGHT = 200
// The columns come to 502: with the table's gaps and edges, 580, the column's width.
const BOOK_ORDER = ['fund', 'index', 'benchmark']

/**
 * py-beacon's named crises (BN-431), each opening under its row to the fund
 * and its comparators from 100 on the crisis's first day, carried on past
 * its end so the recovery shows, the crisis itself shaded (Karan,
 * 2026-11-21). A crisis the run never saw keeps its row, so it is plain it
 * was not skipped.
 */
export function CrisisPeriods({
  answer,
  mode,
  names
}: {
  answer: Analytics | undefined
  mode: ThemeMode
  names: { index: string; benchmark: string }
}): ReactElement {
  const [opened, setOpened] = useState<string | undefined>(undefined)
  const returns = frameOf(answer, 'crisis_returns')
  const paths = frameOf(answer, 'crisis_paths')
  const rows = useMemo(() => recordsOf(returns).flatMap(crisisRow), [returns])
  // The period table's short name, where the column has no room for the long one.
  const header = names.index === 'Index/benchmark' ? 'Index/BM' : names.index
  const columns = useMemo(() => crisisColumns(header, opened), [header, opened])

  if (returns === undefined) {
    return (
      <p className="overview-note type-11">
        {reasonOf(answer, 'crisis_returns') ?? 'Not worked out for this run.'}
      </p>
    )
  }

  return (
    <Table
      className="crisis-table"
      columns={columns}
      rows={rows}
      getRowId={(row) => row.name}
      onSelectRow={(row) => {
        if (!seen(row)) return
        setOpened((current) => (current === row.name ? undefined : row.name))
      }}
      {...(opened === undefined ? {} : { expandedId: opened })}
      renderExpanded={(row) => (
        <CrisisChart row={row} paths={recordsOf(paths)} mode={mode} names={names} />
      )}
    />
  )
}

const seen = (row: CrisisRow): boolean => STATUS[row.status] === undefined

function crisisRow(row: Record<string, Cell>): CrisisRow[] {
  const name = textOf(row.name)
  const start = textOf(row.start)
  const end = textOf(row.end)
  if (name === undefined || start === undefined || end === undefined) return []
  return [
    {
      name,
      start,
      end,
      status: textOf(row.status) ?? 'covered',
      fund: numberOf(row.fund),
      comparator: numberOf(row.comparator),
      outperformance: numberOf(row.outperformance),
      drawdown: numberOf(row.fund_drawdown),
      recoveryDays: numberOf(row.recovery_days),
      recoveryDate: textOf(row.recovery_date)
    }
  ]
}

/** "Feb 2025" to "Apr 2025", or one month when the crisis was inside it. */
function when(row: CrisisRow): string {
  const month = (date: string): string =>
    `${MONTHS[Number(date.slice(5, 7)) - 1] ?? ''} ${date.slice(0, 4)}`
  const first = month(row.start)
  const last = month(row.end)
  if (first === last) return first
  if (row.start.slice(0, 4) === row.end.slice(0, 4)) return `${first.slice(0, 3)} – ${last}`
  return `${first} – ${last}`
}

/** A signed figure, toned, in a row the run saw. */
const signed = (value: number | undefined): ReactElement | string =>
  value === undefined ? '' : <PercentCell value={value * 100} dp={1} />

function crisisColumns(indexName: string, opened: string | undefined): Column<CrisisRow>[] {
  return [
    {
      key: 'open',
      header: '',
      width: 12,
      render: (row) =>
        seen(row) ? (
          <ChevronIcon
            size={10}
            className={
              row.name === opened
                ? 'implementation-chevron implementation-chevron-open'
                : 'implementation-chevron'
            }
          />
        ) : null
    },
    { key: 'name', header: 'Crisis', width: 134, emphasis: true, render: (row) => row.name },
    { key: 'when', header: 'When', width: 104, render: when },
    {
      key: 'fund',
      header: 'Fund',
      width: 46,
      align: 'right',
      // A crisis the run never saw says so across the figures it has none of.
      render: (row) =>
        seen(row) ? signed(row.fund) : <span className="crisis-status">{STATUS[row.status]}</span>
    },
    {
      key: 'comparator',
      header: indexName,
      width: 52,
      align: 'right',
      render: (row) => signed(row.comparator)
    },
    {
      key: 'outperformance',
      header: 'Active',
      width: 46,
      align: 'right',
      render: (row) => signed(row.outperformance)
    },
    {
      key: 'drawdown',
      header: 'Worst fall',
      width: 54,
      align: 'right',
      render: (row) => (row.drawdown === undefined ? '' : signedPercent(row.drawdown * 100, 1))
    },
    {
      key: 'recovery',
      header: 'Recovery',
      width: 54,
      align: 'right',
      render: (row) => {
        if (!seen(row)) return ''
        return row.recoveryDays === undefined ? 'Not yet' : `${String(row.recoveryDays)} days`
      }
    }
  ]
}

function CrisisChart({
  row,
  paths,
  mode,
  names
}: {
  row: CrisisRow
  paths: readonly Record<string, Cell>[]
  mode: ThemeMode
  names: { index: string; benchmark: string }
}): ReactElement {
  const series = useMemo((): Series[] => {
    const mine = paths.filter((path) => path.crisis === row.name)
    return BOOK_ORDER.flatMap((book) => {
      const points = mine.flatMap((path) => {
        const date = textOf(path.date)
        const level = numberOf(path.level)
        return path.book !== book || date === undefined || level === undefined
          ? []
          : [{ date, value: level }]
      })
      if (points.length === 0) return []
      const label = book === 'fund' ? 'Fund' : book === 'index' ? names.index : names.benchmark
      return [{ label, points }]
    })
  }, [paths, row.name, names])
  // Held steady across renders: the chart redraws whenever these change.
  const shade = useMemo(() => {
    const inside = paths
      .filter((path) => path.crisis === row.name && path.phase === 'crisis')
      .flatMap((path) => textOf(path.date) ?? [])
    const from = inside[0]
    const to = inside.at(-1)
    return from === undefined || to === undefined ? undefined : { from, to }
  }, [paths, row.name])
  const events = useMemo(
    () =>
      row.recoveryDate === undefined
        ? undefined
        : [{ date: row.recoveryDate, text: 'Recovered', shape: 'circle' as const }],
    [row.recoveryDate]
  )

  if (series.length === 0) return <p className="overview-note type-11">No path for this crisis.</p>
  return (
    <div className="crisis-chart">
      <LevelChart
        mode={mode}
        series={series}
        height={CHART_HEIGHT}
        legend
        reference={100}
        {...(shade === undefined ? {} : { shade })}
        {...(events === undefined ? {} : { events })}
        note={`${row.start} to ${row.end} shaded. From 100 on the crisis's first day`}
      />
    </div>
  )
}
