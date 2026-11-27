import type { ReactElement } from 'react'
import type { Unit } from '../../api/analytics'
import { Table, type Column } from '../../components/Table/Table'
import { formatValue, toneOf } from '../shared/report/analyticsFormat'
import '../shared/report/ReportFace.css'
import type { Span } from './returnRisk'

/** The name's own column, set apart from the portfolios'. */
const OWN = 'own'

interface Figure {
  id: string
  label: string
  group: 'Return' | 'Risk'
  /** The name's own figure, in its own column, rather than one against each portfolio. */
  own: boolean
  unit: Unit
}

/*
 * Karan's rows (2026-11-27): the name's own return and volatility, and
 * every other figure the name against, or inside, each portfolio. No
 * tracking error: it is the fund's against the index, not one name's.
 */
const FIGURES: readonly Figure[] = [
  { id: 'return', label: 'Total return', group: 'Return', own: true, unit: 'fraction' },
  { id: 'excess_return', label: 'Excess return', group: 'Return', own: false, unit: 'fraction' },
  {
    id: 'contribution',
    label: 'Contribution to return',
    group: 'Return',
    own: false,
    unit: 'fraction'
  },
  { id: 'volatility', label: 'Volatility', group: 'Risk', own: true, unit: 'fraction' },
  { id: 'beta', label: 'Beta', group: 'Risk', own: false, unit: 'ratio' },
  { id: 'correlation', label: 'Correlation', group: 'Risk', own: false, unit: 'ratio' },
  {
    id: 'volatility_share',
    label: 'Share of volatility',
    group: 'Risk',
    own: false,
    unit: 'fraction'
  }
]

/** The figures that read better or worse by sign, so they take the Overview's green and red. */
const SIGNED = new Set(['return', 'excess_return', 'contribution'])

/** The label column's width, and each figure's; the table's gap between columns is extra. */
export const LABEL_WIDTH = 190
export const FIGURE_WIDTH = 64

/**
 * Drilldown → Summary's table (Karan, 2026-11-27): the name's return and
 * risk over the run and over each period shown, oldest first, each a group
 * of columns as the Overview's summary table has: the name's own, then the
 * name against each portfolio the run kept ("vs. Fund"). Every figure is
 * the engine's.
 */
export function ReturnRiskTable({
  spans,
  portfolios,
  identifier,
  headerOf,
  inReturns
}: {
  spans: readonly Span[]
  /** The portfolios with figures, in the order to show them. */
  portfolios: readonly string[]
  identifier: string
  /** A portfolio's short name over its column. */
  headerOf: (portfolio: string) => string
  /** The returns' currency, as a label's suffix. */
  inReturns: string
}): ReactElement {
  const rows = FIGURES.map((figure) => ({
    ...figure,
    // Returns are in the portfolio's currency; a contribution is a share of the fund's return.
    label:
      figure.id === 'return' || figure.id === 'excess_return'
        ? `${figure.label}${inReturns}`
        : figure.label
  }))
  const columns: Column<Figure>[] = [
    { key: 'figure', header: '', width: LABEL_WIDTH, rowName: true, render: (row) => row.label },
    ...spans.flatMap((span) =>
      [OWN, ...portfolios].map((portfolio): Column<Figure> => ({
        key: `${span.key}-${portfolio}`,
        header: portfolio === OWN ? identifier : `vs. ${headerOf(portfolio)}`,
        group: span.label,
        // As narrow as "vs. Index/BM" over a figure like -12.34% allows.
        width: FIGURE_WIDTH,
        minWidth: 56,
        align: 'right',
        render: (row) => figureIn(span, row, portfolio)
      }))
    )
  ]
  return (
    <Table columns={columns} rows={rows} getRowId={(row) => row.id} rowGroup={(row) => row.group} />
  )
}

/** A figure in its column; nothing where the row has no figure of that kind. */
function figureIn(span: Span, figure: Figure, portfolio: string): ReactElement | null {
  if (figure.own !== (portfolio === OWN)) return null
  const value = span.values[figure.own ? figure.id : `${figure.id}/${portfolio}`] ?? null
  const tone = SIGNED.has(figure.id) ? toneOf(value, figure.unit) : ''
  return (
    <span className={`report-figure ${tone}`}>
      {formatValue(value, figure.unit, figure.unit === 'fraction' ? 4 : 2)}
    </span>
  )
}
