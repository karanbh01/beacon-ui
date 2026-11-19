import { useMemo, useState, type ReactElement } from 'react'
import type { AnalysisOptions, StatisticSpec, TableFrame, Unit } from '../../api/analytics'
import { Button } from '../../components/Button/Button'
import { Dialog } from '../../components/Dialog/Dialog'
import { Section } from '../../components/Section/Section'
import { Table, type Column } from '../../components/Table/Table'
import { useAnalysisOptions, useAnalytics } from '../shared/analyticsQueries'
import { formatValue, isSigned, toneOf } from '../shared/report/analyticsFormat'
import { ReportFace } from '../shared/report/ReportFace'

/** The periods across, shortest first and since inception last (Karan, 2026-11-06). */
const PERIODS = ['1M', '3M', 'YTD', '1Y', '3Y', '5Y', 'inception']
const PERIOD_LABELS: Record<string, string> = { inception: 'SI' }
const BOOKS = ['fund', 'index', 'benchmark']

/*
 * Provisional: the statistics-by-period table as the stub stands it in,
 * until py-beacon names its own (asked for BU-294).
 */
const SOURCE = 'trailing_statistics'

/*
 * The one row the stub's catalogue has under another id (it names the
 * whole-run figure `cagr`). Provisional with the table.
 */
const ROWS: Record<string, { label: string; unit: Unit }> = {
  annualised_return: { label: 'Annualised return (CAGR)', unit: 'fraction' }
}

interface Row {
  id: string
  spec: StatisticSpec | undefined
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
      <Table columns={columnsOf(books, options.data)} rows={rows} getRowId={(row) => row.id} />
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
  const byId = new Map<string, Row>()
  for (const cells of frame.data) {
    const period = String(cells[at('period')] ?? '')
    const id = String(cells[at('statistic')] ?? '')
    const row = byId.get(id) ?? {
      id,
      spec: options.statistics.find((statistic) => statistic.id === id),
      values: {}
    }
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

function columnsOf(books: readonly string[], options: AnalysisOptions): Column<Row>[] {
  return [
    {
      key: 'statistic',
      header: 'Statistic',
      width: 170,
      rowName: true,
      render: (row) => ROWS[row.id]?.label ?? row.spec?.label ?? row.id
    },
    ...PERIODS.flatMap((period) =>
      books.map((book): Column<Row> => ({
        key: `${period}-${book}`,
        header: options.names.book?.[book] ?? book,
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
  const unit = ROWS[row.id]?.unit ?? row.spec?.unit
  const signed = row.id in ROWS || (row.spec !== undefined && isSigned(row.spec))
  const tone = signed ? toneOf(value, unit) : ''
  return (
    <span className={`report-figure ${tone}`}>
      {formatValue(value, unit, unit === 'fraction' ? 4 : 2)}
    </span>
  )
}
