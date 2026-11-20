import { useMemo, useState, type ReactElement } from 'react'
import type { AnalysisOptions, StatisticSpec, TableFrame, Unit } from '../../api/analytics'
import { Button } from '../../components/Button/Button'
import { Dialog } from '../../components/Dialog/Dialog'
import { Section } from '../../components/Section/Section'
import { Table, type Column } from '../../components/Table/Table'
import { useAnalysisOptions, useAnalytics } from '../shared/analyticsQueries'
import { formatValue, isSigned, toneOf } from '../shared/report/analyticsFormat'
import { ReportFace } from '../shared/report/ReportFace'
import { useComparators } from './comparators'

/** The periods across, shortest first and since inception last (Karan, 2026-11-06). */
const PERIODS = ['1M', '3M', 'YTD', '1Y', '3Y', '5Y', 'inception']
const PERIOD_LABELS: Record<string, string> = { inception: 'SI' }
const BOOKS = ['fund', 'index', 'benchmark']

/** py-beacon's statistics by trailing period (BN-422, 0.10.1). */
const SOURCE = 'trailing_statistics'

/*
 * A row signed although the stub's catalogue has no statistic of its id:
 * it names the whole-run figure `cagr`, py-beacon `annualised_return`.
 */
const SIGNED_ROWS = new Set(['annualised_return'])

interface Row {
  id: string
  /** The table's own label for the statistic, from its catalogue column. */
  label: string
  /** Each row's unit, as the books mix returns and a ratio (BN-422). */
  unit: Unit | null | undefined
  signed: boolean
  /** Figure by period, then by book. Missing or null shows as a dash. */
  values: Record<string, Record<string, number | null>>
}

/**
 * Summary's table (BU-294): each period a group of columns, a column per
 * book within it, and a statistic on each row. Every figure is the engine's;
 * a period longer than the run's history comes back empty and shows a dash.
 * The rest of the factsheet is a click away, not on the page.
 */
export function SummaryTable({ strategyId }: { strategyId: string }): ReactElement | null {
  const options = useAnalysisOptions()
  const analytics = useAnalytics(strategyId)
  const { benchmarkIsIndex } = useComparators(strategyId)
  const [everything, setEverything] = useState(false)

  const answer = analytics.data?.status === 'computed' ? analytics.data.analytics : undefined
  const value = answer?.statistics[SOURCE]
  const frame = value?.kind === 'table' ? value.point : undefined
  const rows = useMemo(
    () => (frame === undefined || options.data === undefined ? [] : rowsOf(frame, options.data)),
    [frame, options.data]
  )
  if (options.data === undefined || rows.length === 0) return null

  const books = BOOKS.filter((book) =>
    rows.some((row) => PERIODS.some((period) => row.values[period]?.[book] != null))
  )
  return (
    <Section
      title="Summary statistics"
      className="overview-stats summary-table"
      aside={
        <Button
          onClick={() => {
            setEverything(true)
          }}
        >
          All statistics
        </Button>
      }
    >
      <Table
        columns={columnsOf(books, options.data, benchmarkIsIndex)}
        rows={rows}
        getRowId={(row) => row.id}
      />
      {everything && (
        <Dialog
          title="All statistics"
          note="Every figure in the run's factsheet."
          width={920}
          onClose={() => {
            setEverything(false)
          }}
        >
          <ReportFace strategyId={strategyId} reports={['factsheet']} />
        </Dialog>
      )}
    </Section>
  )
}

/** The frame's rows, one per period and statistic, folded into a row per statistic. */
function rowsOf(frame: TableFrame, options: AnalysisOptions): Row[] {
  const at = (name: string): number => frame.columns.indexOf(name)
  const labels = options.statistics
    .find((statistic) => statistic.id === SOURCE)
    ?.columns?.find((column) => column.name === 'statistic')?.labels
  const byId = new Map<string, Row>()
  for (const cells of frame.data) {
    const period = String(cells[at('period')] ?? '')
    const id = String(cells[at('statistic')] ?? '')
    const row = byId.get(id) ?? newRow(id, cells[at('unit')], labels, options)
    row.values[period] = Object.fromEntries(
      BOOKS.map((book) => {
        const cell = cells[at(book)]
        return [book, typeof cell === 'number' ? cell : null]
      })
    )
    byId.set(id, row)
  }
  return [...byId.values()]
}

function newRow(
  id: string,
  unit: unknown,
  labels: Record<string, string> | undefined,
  options: AnalysisOptions
): Row {
  const spec: StatisticSpec | undefined = options.statistics.find(
    (statistic) => statistic.id === id
  )
  return {
    id,
    label: labels?.[id] ?? spec?.label ?? id,
    // A row's unit is one of these two (BN-422); the statistic's own if a row has none.
    unit: unit === 'fraction' || unit === 'ratio' ? unit : spec?.unit,
    signed: SIGNED_ROWS.has(id) || (spec !== undefined && isSigned(spec)),
    values: {}
  }
}

function columnsOf(
  books: readonly string[],
  options: AnalysisOptions,
  benchmarkIsIndex: boolean
): Column<Row>[] {
  // The index that is also the benchmark, short enough for the column (Karan, 2026-11-20).
  const headerOf = (book: string): string =>
    book === 'index' && benchmarkIsIndex ? 'Index/BM' : (options.names.book?.[book] ?? book)
  return [
    {
      key: 'statistic',
      header: 'Statistic',
      width: 170,
      rowName: true,
      render: (row) => row.label
    },
    ...PERIODS.flatMap((period) =>
      books.map((book): Column<Row> => ({
        key: `${period}-${book}`,
        header: headerOf(book),
        group: PERIOD_LABELS[period] ?? period,
        // As narrow as a figure like -12.34% needs (Karan, 2026-11-19).
        width: 54,
        minWidth: 48,
        align: 'right',
        render: (row) => figure(row, period, book)
      }))
    )
  ]
}

function figure(row: Row, period: string, book: string): ReactElement {
  const value = row.values[period]?.[book]
  const unit = row.unit
  const tone = row.signed ? toneOf(value, unit) : ''
  return (
    <span className={`report-figure ${tone}`}>
      {formatValue(value, unit, unit === 'fraction' ? 4 : 2)}
    </span>
  )
}
