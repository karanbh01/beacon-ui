import { useMemo, type ReactElement } from 'react'
import type { Analytics, StatisticSpec, Unit } from '../../api/analytics'
import { Table, type Column } from '../../components/Table/Table'
import { formatValue } from '../shared/report/analyticsFormat'
import { frameOf, numberOf, reasonOf, recordsOf, textOf } from './analyticsFrames'

/** Provisional: the risk figures by period, shaped as `trailing_statistics` is. */
const SOURCE = 'trailing_risk'

/** Each a group of columns, as Summary's table has them (Karan, 2026-11-22). */
const PERIODS: readonly { id: string; label: string }[] = [
  { id: '1Y', label: '1Y' },
  { id: '3Y', label: '3Y' },
  { id: '5Y', label: '5Y' },
  { id: 'inception', label: 'SI' }
]
const BOOKS = ['fund', 'index', 'benchmark'] as const
type Book = (typeof BOOKS)[number]

/** Tight, to fit the frontier's width with the index beside the fund (Karan, 2026-11-22): 578 of 580. */
const LABEL_WIDTH = 130
const FIGURE_WIDTH = 45

interface FigureRow {
  id: string
  label: string
  unit: Unit | null
  /** Figure by period, then by book; a period longer than the run has none. */
  values: Record<string, Partial<Record<Book, number>>>
}

/**
 * Figures over the last one, three and five years and since inception, laid
 * out as Summary's table is: a group of columns a period, a column a book. A
 * figure of the fund against a comparator is under the comparator's column,
 * as py-beacon gives it. All the engine's; a period the run is too short for
 * shows a dash.
 */
export function RiskFigures({
  answer,
  spec,
  names,
  figures
}: {
  answer: Analytics | undefined
  /** The statistic's catalogue entry, for each figure's name. */
  spec: StatisticSpec | undefined
  names: { index: string; benchmark: string }
  /** Which figures, in order. */
  figures: readonly string[]
}): ReactElement {
  const frame = frameOf(answer, SOURCE)
  const rows = useMemo(() => figureRows(recordsOf(frame), spec, figures), [frame, spec, figures])
  const columns = useMemo(() => figureColumns(booksOf(rows), names), [rows, names])

  if (rows.length === 0) {
    return (
      <p className="overview-note type-11">
        {reasonOf(answer, SOURCE) ?? 'Not worked out for this run.'}
      </p>
    )
  }
  return <Table className="risk-figures" columns={columns} rows={rows} getRowId={(row) => row.id} />
}

function figureRows(
  records: readonly Record<string, string | number | boolean | null>[],
  spec: StatisticSpec | undefined,
  figures: readonly string[]
): FigureRow[] {
  const labels = spec?.columns?.find((column) => column.name === 'statistic')?.labels
  return figures.flatMap((id): FigureRow[] => {
    const own = records.filter((record) => record.statistic === id)
    if (own.length === 0) return []
    const unit = textOf(own[0]?.unit)
    const values: FigureRow['values'] = {}
    for (const record of own) {
      values[textOf(record.period) ?? ''] = Object.fromEntries(
        BOOKS.flatMap((book) => {
          const value = numberOf(record[book])
          return value === undefined ? [] : [[book, value]]
        })
      )
    }
    return [
      {
        id,
        label: labels?.[id] ?? id,
        unit: unit === 'fraction' || unit === 'ratio' ? unit : null,
        values
      }
    ]
  })
}

/** The books with a figure anywhere, as Summary's table keeps them. */
function booksOf(rows: readonly FigureRow[]): Book[] {
  return BOOKS.filter((book) =>
    rows.some((row) => PERIODS.some((period) => row.values[period.id]?.[book] !== undefined))
  )
}

function figureColumns(
  books: readonly Book[],
  names: { index: string; benchmark: string }
): Column<FigureRow>[] {
  const header: Record<Book, string> = {
    fund: 'Fund',
    // The index that is also the benchmark, short enough for the column, as Summary has it.
    index: names.index === 'Index/benchmark' ? 'Index/BM' : names.index,
    benchmark: 'BM'
  }
  return [
    { key: 'label', header: '', width: LABEL_WIDTH, rowName: true, render: (row) => row.label },
    ...PERIODS.flatMap(({ id, label }) =>
      books.map((book): Column<FigureRow> => ({
        key: `${id}-${book}`,
        header: header[book],
        group: label,
        width: FIGURE_WIDTH,
        align: 'right',
        // A percentage to one place and a ratio to two, so the columns stay narrow.
        render: (row) => (
          <span className="report-figure">
            {formatValue(row.values[id]?.[book], row.unit, row.unit === 'fraction' ? 3 : 2)}
          </span>
        )
      }))
    )
  ]
}
