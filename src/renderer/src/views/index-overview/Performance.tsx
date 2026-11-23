import { useMemo, useRef, useState, type ReactElement } from 'react'
import { useWidth } from '../../charts/useWidth'
import { Button } from '../../components/Button/Button'
import { Section } from '../../components/Section/Section'
import { Table, type Column } from '../../components/Table/Table'
import { useThemeMode } from '../../state/theme'
import { usePeriods, useOverview } from '../shared/beaconQueries'
import { toPoints } from '../shared/indexMetrics'
import type { Frequency } from '../shared/periods'
import { useComparators } from './comparators'
import { toneOf } from '../shared/report/analyticsFormat'
import { PeriodRegression, PeriodReturns } from './PerformanceCharts'
import {
  BOOK_HEADERS,
  performanceMatrix,
  type Book,
  type PerformancePeriod,
  type PerformanceRow
} from './performanceMatrix'

export interface PerformanceProps {
  strategyId: string
  period: Frequency
  onPeriod: (period: Frequency) => void
}

/** Returns open, the rest folded until asked for (Karan, 2026-11-23). */
const OPEN_GROUPS = ['Returns']

/** As Summary's table has them (Karan, 2026-11-19): as narrow as -12.34% needs. */
const LABEL_WIDTH = 150
const FIGURE_WIDTH = 54
/** The table's gap between columns, which its widths leave out. */
const GAP = 10

/**
 * Overview → Performance (BU-176; one table since Karan, 2026-11-23).
 *
 * Every figure by period in one table, laid out as Summary's is: since
 * inception and each calendar period a group of columns, the fund, the
 * index and the benchmark a column in each. As many periods as the pane
 * has room for, the newest on the right (Karan, 2026-11-23), and the rest a
 * step back, so the table never scrolls sideways. Every figure is py-beacon's.
 *
 * Above it, two charts (Karan, 2026-11-23): each period's return or
 * risk-adjusted return, and the fund's regression on what it is measured
 * on. A period pointed at in the first lights its days in the second, and a
 * click holds it there and brings the table to it.
 */
export function Performance({ strategyId, period, onPeriod }: PerformanceProps): ReactElement {
  const overview = useOverview(strategyId)
  const comparators = useComparators(strategyId)
  const periods = usePeriods(strategyId, period)
  const mode = useThemeMode()
  const host = useRef<HTMLDivElement>(null)
  const width = useWidth(host)
  // How many periods back from the newest the table starts, by frequency.
  const [back, setBack] = useState(0)
  // A period held by a click on the returns chart, and one under the pointer there.
  const [picked, setPicked] = useState<string | undefined>(undefined)
  const [hovered, setHovered] = useState<string | undefined>(undefined)
  const fund = useMemo(() => toPoints(overview.data?.level), [overview.data])

  const matrix = useMemo(
    () =>
      performanceMatrix(overview.data?.metrics, comparators, periods.data?.periods ?? [], period),
    [overview.data, comparators, periods.data, period]
  )
  const [since, ...calendar] = matrix.periods
  const room = Math.max(1, Math.floor((width - LABEL_WIDTH) / groupWidth(matrix.books.length)) - 1)
  // Oldest first, so the window ends `back` periods short of the newest.
  const behind = Math.min(back, Math.max(0, calendar.length - room))
  const end = calendar.length - behind
  const shown = calendar.slice(Math.max(0, end - room), end)
  const columns = columnsOf([...(since === undefined ? [] : [since]), ...shown], matrix.books)

  const choose = (next: Frequency): void => {
    setBack(0)
    setPicked(undefined)
    onPeriod(next)
  }
  // A period picked off the table's page brings the table to it, in the middle.
  const pick = (key: string): void => {
    setPicked(picked === key ? undefined : key)
    const at = calendar.findIndex((each) => each.key === key)
    if (at === -1 || (at >= end - room && at < end)) return
    setBack(Math.max(0, calendar.length - (at + 1 + Math.floor(room / 2))))
  }
  const first = shown[0]?.label
  const last = shown[shown.length - 1]?.label

  return (
    <div className="performance-face" ref={host}>
      {periods.isError && (
        <p className="overview-note type-11">
          The figures by period could not be loaded: {periods.error.message}
        </p>
      )}
      <div className="performance-charts">
        <PeriodReturns
          matrix={matrix}
          calendar={calendar}
          shown={shown}
          period={period}
          picked={picked}
          mode={mode}
          onPeriod={choose}
          onHover={setHovered}
          onPick={pick}
        />
        <PeriodRegression
          fund={fund}
          comparators={comparators}
          matrix={matrix}
          focus={hovered ?? picked}
          mode={mode}
        />
      </div>
      <Section
        title="Statistics by period"
        aside={
          <>
            {calendar.length > room && (
              <span className="performance-pager">
                <Button
                  disabled={end <= room}
                  onClick={() => {
                    setBack(behind + room)
                  }}
                >
                  Earlier
                </Button>
                <span className="performance-range type-11">
                  {first === last ? first : `${first ?? ''} to ${last ?? ''}`}
                </span>
                <Button
                  disabled={behind === 0}
                  onClick={() => {
                    setBack(Math.max(0, behind - room))
                  }}
                >
                  Later
                </Button>
              </span>
            )}
          </>
        }
      >
        {overview.data !== undefined && (
          <Table
            columns={columns}
            rows={matrix.rows}
            getRowId={(row) => row.key}
            rowGroup={(row) => row.group}
            openGroups={OPEN_GROUPS}
          />
        )}
      </Section>
    </div>
  )
}

/** A period's group of columns, gaps included. */
const groupWidth = (books: number): number => books * (FIGURE_WIDTH + GAP)

function columnsOf(
  periods: readonly PerformancePeriod[],
  books: readonly Book[]
): Column<PerformanceRow>[] {
  return [
    { key: 'label', header: '', width: LABEL_WIDTH, rowName: true, render: (row) => row.label },
    ...periods.flatMap(({ key, label }) =>
      books.map((book): Column<PerformanceRow> => ({
        key: `${key}-${book}`,
        header: BOOK_HEADERS[book],
        group: label,
        width: FIGURE_WIDTH,
        minWidth: 48,
        align: 'right',
        render: (row) => figure(row, key, book)
      }))
    )
  ]
}

function figure(row: PerformanceRow, period: string, book: Book): ReactElement {
  const value = row.values[period]?.[book]
  // Every signed row is a fraction, which is what toneOf colours.
  const tone = row.signed ? toneOf(value, 'fraction') : ''
  return (
    <span className={`report-figure ${tone}`}>{value === undefined ? '—' : row.format(value)}</span>
  )
}
