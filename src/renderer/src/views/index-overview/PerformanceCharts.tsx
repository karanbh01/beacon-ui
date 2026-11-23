import { useMemo, useState, type ReactElement } from 'react'
import { GroupedBarChart } from '../../charts/GroupedBarChart'
import { RegressionChart, type RegressionLine } from '../../charts/RegressionChart'
import { seriesColor } from '../../charts/theme'
import type { Point } from '../../charts/transform'
import { Section } from '../../components/Section/Section'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { COLORS, type ThemeMode } from '../../tokens/tokens'
import { FREQUENCIES, type Frequency } from '../shared/periods'
import { fromFraction, signedPercent } from '../shared/indexMetrics'
import { namedComparators, type ComparatorRole, type Comparators } from './comparators'
import {
  BOOK_HEADERS,
  SINCE_INCEPTION,
  type Book,
  type PerformanceMatrix,
  type PerformancePeriod
} from './performanceMatrix'

/** Both charts' height, so they line up side by side. */
const HEIGHT = 276
const YEAR = 252

type Measure = 'return' | 'sharpe' | 'sortino'
const MEASURES: readonly { value: Measure; label: string }[] = [
  { value: 'return', label: 'Return' },
  { value: 'sharpe', label: 'Sharpe' },
  { value: 'sortino', label: 'Sortino' }
]

/** A book's colour: the fund and the index in the palette, a benchmark in its own ink. */
function colourOf(mode: ThemeMode, book: Book): string {
  if (book === 'fund') return seriesColor(mode, 0)
  if (book === 'index') return seriesColor(mode, 1)
  return COLORS[mode]['text-secondary']
}

/**
 * Each calendar period's return, or what it earned for its risk, the fund
 * beside what it is measured on (Karan, 2026-11-23). Every period at the
 * table's frequency, the ones the table is showing under a wash; a click
 * takes the table to a period and picks it for the regression beside.
 */
export function PeriodReturns({
  matrix,
  calendar,
  shown,
  period,
  picked,
  mode,
  onPeriod,
  onHover,
  onPick
}: {
  matrix: PerformanceMatrix
  calendar: readonly PerformancePeriod[]
  shown: readonly PerformancePeriod[]
  period: Frequency
  picked: string | undefined
  mode: ThemeMode
  /** The frequency, for the charts and the table alike. */
  onPeriod: (period: Frequency) => void
  onHover: (period: string | undefined) => void
  onPick: (period: string) => void
}): ReactElement {
  const [chosen, setChosen] = useState<Measure>('return')
  // A month is too short for a ratio, as in the table (Karan, 2026-11-23).
  const measure = period === 'monthly' ? 'return' : chosen
  const row = matrix.rows.find((each) => each.key === measure)
  const series = matrix.books.map((book) => ({
    key: book,
    label: BOOK_HEADERS[book],
    colour: colourOf(mode, book)
  }))
  const shaded = useMemo(() => new Set(shown.map(({ key }) => key)), [shown])
  const ratio = measure !== 'return'

  return (
    <Section
      title={ratio ? 'Risk-adjusted return by period' : 'Return by period'}
      aside={
        <SegmentedControl
          segments={FREQUENCIES}
          value={period}
          onChange={onPeriod}
          label="Period"
        />
      }
    >
      {row !== undefined && (
        <GroupedBarChart
          categories={calendar.map(({ key }) => key)}
          series={series}
          value={(category, book) => row.values[category]?.[book as Book]}
          mode={mode}
          height={HEIGHT}
          tickFormat={(value) => (ratio ? value.toFixed(1) : `${(value * 100).toFixed(0)}%`)}
          format={row.format}
          shaded={shaded}
          focus={picked}
          onHover={onHover}
          onSelect={onPick}
          legendStart={
            period !== 'monthly' && (
              <SegmentedControl
                segments={MEASURES}
                value={chosen}
                onChange={setChosen}
                label="Measure"
              />
            )
          }
          label={row.label}
        />
      )}
    </Section>
  )
}

/**
 * The fund's daily moves on its comparator's, under py-beacon's fitted line
 * since inception and, for a period picked or pointed at beside, that
 * period's line over its own days (Karan, 2026-11-23). The dots are the two
 * lines' moves, drawn as they are; the slopes and intercepts are the
 * engine's beta and alpha.
 */
export function PeriodRegression({
  fund,
  comparators,
  matrix,
  focus,
  mode
}: {
  fund: readonly Point[]
  comparators: Comparators
  matrix: PerformanceMatrix
  focus: string | undefined
  mode: ThemeMode
}): ReactElement | null {
  const named = namedComparators(comparators)
  const [chosen, setChosen] = useState<ComparatorRole | undefined>(undefined)
  const current = named.find(({ role }) => role === chosen) ?? named[0]
  const moves = useMemo(
    () => (current === undefined ? [] : dailyMoves(fund, current.comparator.points)),
    [fund, current]
  )
  if (current === undefined) return null

  const role = current.role
  const figure = (key: string, column: string): number | undefined =>
    matrix.rows.find((row) => row.key === key)?.values[column]?.[role]
  const lineOf = (column: string, colour: string, dashed: boolean): RegressionLine[] => {
    const beta = figure('beta', column)
    if (beta === undefined) return []
    // Alpha is a year's; the dots are days. Without one the line runs through nothing.
    const intercept = (figure('alpha', column) ?? 0) / YEAR
    return [{ key: column, slope: beta, intercept, colour, dashed }]
  }
  const lit = focus === undefined ? undefined : seriesColor(mode, 0)
  const lines = [
    ...lineOf(SINCE_INCEPTION, COLORS[mode]['text-primary'], true),
    ...(focus === undefined || lit === undefined ? [] : lineOf(focus, lit, false))
  ]
  const name = BOOK_HEADERS[role]
  // A period's days are those after the close it runs from, through its last.
  const span = matrix.periods.find(({ key }) => key === focus)?.span
  const inSpan = (date: string): boolean =>
    span !== undefined && date.slice(0, 10) > span.start && date.slice(0, 10) <= span.end

  return (
    <Section
      title={`Regression on the ${role === 'index' ? 'index' : role === 'benchmark' ? 'benchmark' : 'index/benchmark'}`}
      aside={
        named.length > 1 && (
          <SegmentedControl
            segments={named.map(({ role: each }) => ({ value: each, label: BOOK_HEADERS[each] }))}
            value={role}
            onChange={setChosen}
            label="Measured on"
          />
        )
      }
    >
      <div className="regression-legend type-11">
        <Readout
          label="Since inception"
          beta={figure('beta', SINCE_INCEPTION)}
          rSquared={figure('r-squared', SINCE_INCEPTION)}
          alpha={figure('alpha', SINCE_INCEPTION)}
          line={`1.5px dashed ${COLORS[mode]['text-primary']}`}
        />
        {focus !== undefined && (
          <Readout
            label={focus}
            beta={figure('beta', focus)}
            rSquared={figure('r-squared', focus)}
            alpha={figure('alpha', focus)}
            line={`1.5px solid ${seriesColor(mode, 0)}`}
          />
        )}
      </div>
      <RegressionChart
        dots={moves.map((move) => ({
          key: move.date,
          x: move.theirs,
          y: move.mine,
          lit: inSpan(move.date)
        }))}
        lines={lines}
        mode={mode}
        height={HEIGHT}
        litColour={lit ?? seriesColor(mode, 0)}
        xLabel={`${name}, daily`}
        yLabel="Fund, daily"
      />
    </Section>
  )
}

function Readout({
  label,
  beta,
  rSquared,
  alpha,
  line
}: {
  label: string
  beta: number | undefined
  rSquared: number | undefined
  alpha: number | undefined
  /** The line's border, as the chart draws it. */
  line: string
}): ReactElement {
  const parts = [
    beta === undefined ? undefined : `beta ${beta.toFixed(2)}`,
    rSquared === undefined ? undefined : `R² ${rSquared.toFixed(2)}`,
    alpha === undefined ? undefined : `alpha ${signedPercent(fromFraction(alpha), 2)}`
  ].filter((part) => part !== undefined)
  return (
    <span>
      <span className="regression-legend-line" style={{ borderTop: line }} />
      {label}
      {parts.length > 0 && ` · ${parts.join(' · ')}`}
    </span>
  )
}

/** Each day both lines have, as the fund's move and the comparator's. */
function dailyMoves(
  fund: readonly Point[],
  comparator: readonly Point[]
): { date: string; mine: number; theirs: number }[] {
  const theirs = new Map(comparator.map((point) => [point.date, point.value]))
  const shared = fund.filter((point) => theirs.has(point.date))
  return shared.slice(1).flatMap((point, at) => {
    const before = shared[at]
    const theirNow = theirs.get(point.date)
    const theirBefore = before === undefined ? undefined : theirs.get(before.date)
    if (before === undefined || theirNow === undefined || theirBefore === undefined) return []
    return [
      { date: point.date, mine: point.value / before.value - 1, theirs: theirNow / theirBefore - 1 }
    ]
  })
}
