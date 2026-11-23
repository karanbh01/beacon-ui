import { useMemo, useRef, type ReactElement } from 'react'
import type { Analytics } from '../../api/analytics'
import {
  FrontierChart,
  type CloudDot,
  type FrontierDot,
  type PortfolioMark
} from '../../charts/FrontierChart'
import { useWidth } from '../../charts/useWidth'
import type { ThemeMode } from '../../tokens/tokens'
import { percent } from '../shared/indexMetrics'
import { frameOf, numberOf, reasonOf, recordsOf, textOf, type Cell } from './analyticsFrames'
import { BenchmarkMark } from './StyleBox'

// Taller than half its first height, short of the whole; 15px off it again (Karan, 2026-11-22).
const HEIGHT = 345
const BOOKS = ['fund', 'index', 'benchmark'] as const

/**
 * Every name the index held over the run, by return and volatility, under
 * the frontier drawn through the largest of them in hindsight, with the fund
 * and its comparators on it as the style box marks them (Karan, 2026-11-21;
 * py-beacon BN-429). The chart alone: the figures are in its hover.
 */
export function RiskFrontier({
  answer,
  mode,
  names
}: {
  answer: Analytics | undefined
  mode: ThemeMode
  /** What the index and the benchmark are called here. */
  names: { index: string; benchmark: string }
}): ReactElement {
  const host = useRef<HTMLDivElement>(null)
  const width = useWidth(host)
  const members = frameOf(answer, 'member_risk_return')
  const portfolios = frameOf(answer, 'portfolio_risk_return')
  const frontier = frameOf(answer, 'efficient_frontier')

  const cloud = useMemo(() => recordsOf(members).flatMap(cloudDot), [members])
  const marks = useMemo(
    () =>
      recordsOf(portfolios).flatMap((row): PortfolioMark[] => {
        const book = BOOKS.find((each) => each === row.book)
        const volatility = numberOf(row.volatility)
        const expectedReturn = numberOf(row.return)
        if (book === undefined || volatility === undefined || expectedReturn === undefined)
          return []
        const label = book === 'fund' ? 'Fund' : names[book]
        return [{ book, label, volatility, expectedReturn }]
      }),
    [portfolios, names]
  )
  const curve = useMemo(() => recordsOf(frontier).flatMap(frontierDot), [frontier])

  if (members === undefined && frontier === undefined) {
    return (
      <p className="overview-note type-11">
        {reasonOf(answer, 'member_risk_return') ?? 'Not worked out for this run.'}
      </p>
    )
  }

  return (
    <div className="risk-frontier" ref={host}>
      <FrontierLegend books={marks.map((mark) => mark.book)} names={names} />
      {width > 0 && (
        <FrontierChart
          points={curve}
          mode={mode}
          cloud={cloud}
          portfolios={marks}
          returnLabel="Return"
          width={width}
          height={HEIGHT}
        />
      )}
      {/* No footnote (Karan, 2026-11-22): only why, when there is no frontier to draw. */}
      {frontier === undefined && (
        <p className="overview-note type-11">
          {reasonOf(answer, 'efficient_frontier') ?? 'No frontier for this run.'}
        </p>
      )}
    </div>
  )
}

function cloudDot(row: Record<string, Cell>): CloudDot[] {
  const name = textOf(row.name)
  const volatility = numberOf(row.volatility)
  const expectedReturn = numberOf(row.return)
  if (name === undefined || volatility === undefined || expectedReturn === undefined) return []
  const fund = numberOf(row.fund_weight)
  const index = numberOf(row.index_weight)
  const detail: (readonly [string, string])[] = []
  if (fund !== undefined) detail.push(['Fund weight', percent(fund * 100, 2)])
  if (index !== undefined) detail.push(['Index weight', percent(index * 100, 2)])
  if (row.in_index_at_end === false) detail.push(['Left the index', textOf(row.last) ?? ''])
  return [{ name, volatility, expectedReturn, held: fund !== undefined, detail }]
}

function frontierDot(row: Record<string, Cell>): FrontierDot[] {
  const volatility = numberOf(row.volatility)
  const expectedReturn = numberOf(row.return)
  if (volatility === undefined || expectedReturn === undefined) return []
  return [{ volatility, expectedReturn, binding: [], heuristic: false }]
}

function FrontierLegend({
  books,
  names
}: {
  books: readonly PortfolioMark['book'][]
  names: { index: string; benchmark: string }
}): ReactElement {
  return (
    <div className="risk-legend type-11">
      {books.includes('fund') && (
        <span>
          <svg width={10} height={10} aria-hidden="true">
            <circle className="frontier-fund" cx={5} cy={5} r={4} />
          </svg>
          Fund
        </span>
      )}
      {books.includes('index') && (
        <span>
          <svg width={10} height={10} aria-hidden="true">
            <rect
              className="frontier-index"
              x={2}
              y={2}
              width={6}
              height={6}
              transform="rotate(45 5 5)"
            />
          </svg>
          {names.index}
        </span>
      )}
      {books.includes('benchmark') && (
        <span>
          <svg width={10} height={10} aria-hidden="true">
            <BenchmarkMark x={5} y={5} half={3.5} />
          </svg>
          {names.benchmark}
        </span>
      )}
      <span>
        <span className="risk-legend-dot risk-legend-held" />
        Held by the fund
      </span>
      <span>
        <span className="risk-legend-dot" />
        Other members
      </span>
      <span>
        <span className="risk-legend-line" />
        Frontier
      </span>
    </div>
  )
}
