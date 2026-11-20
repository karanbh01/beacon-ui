import type { ReactElement } from 'react'
import { Stat } from '../../components/Stat/Stat'
import { fromFraction, percent, signedPercent, tone } from '../shared/indexMetrics'
import { namedComparators, ROLE_NAMES, type Comparators } from './comparators'

export interface HeadlineStatisticsProps {
  comparators: Comparators
  /** The run's own figures, in percent. */
  figures: {
    total: number | undefined
    cagr: number | undefined
    volatility: number | undefined
    drawdown: number | undefined
  }
}

/**
 * The figures the strip carried, as the strip drew them (a name over a
 * larger figure), three to a row, over the chart (Karan, 2026-11-20): the
 * run's return, each comparator's and the gap to it, then risk. Four to a
 * row with an index and a separate benchmark, so eight figures still take
 * two rows: the run's own, then the comparisons.
 */
export function HeadlineStatistics({
  comparators,
  figures
}: HeadlineStatisticsProps): ReactElement {
  const against = (label: string, comparator: Comparators['index']): ReactElement[] => {
    if (comparator === undefined) return []
    const theirs = fromFraction(comparator.own.total_return)
    const lead = fromFraction(comparator.relative.relative_return)
    return [
      <Stat
        key={`${label}-return`}
        label={`${label} return`}
        value={signedPercent(theirs)}
        tone={tone(theirs)}
      />,
      <Stat
        key={`${label}-lead`}
        label={`vs. ${label.toLowerCase()}`}
        value={signedPercent(lead, 2)}
        tone={tone(lead)}
      />
    ]
  }
  const named = namedComparators(comparators)
  const total = (
    <Stat label="Total return" value={signedPercent(figures.total)} tone={tone(figures.total)} />
  )
  const comparisons = named.flatMap((each) => against(ROLE_NAMES[each.role], each.comparator))
  const risk = (
    <>
      <Stat label="CAGR" value={percent(figures.cagr)} />
      <Stat label="Volatility" value={percent(figures.volatility)} />
      <Stat label="Max drawdown" value={signedPercent(figures.drawdown)} tone="negative" />
    </>
  )
  // Four to a row: the run's own figures, then each comparator's pair under them.
  if (named.length > 1) {
    return (
      <div className="headline-statistics headline-statistics-wide">
        {total}
        {risk}
        {comparisons}
      </div>
    )
  }
  return (
    <div className="headline-statistics">
      {total}
      {comparisons}
      {risk}
    </div>
  )
}
