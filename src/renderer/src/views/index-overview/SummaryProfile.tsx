import type { ReactElement } from 'react'
import type { Analytics, StatisticSpec, TableFrame } from '../../api/analytics'
import { Section } from '../../components/Section/Section'
import { Stat } from '../../components/Stat/Stat'
import { useAnalysisOptions, useAnalytics } from '../shared/analyticsQueries'
import { fromFraction, percent, signedPercent, tone } from '../shared/indexMetrics'
import type { Comparators } from './comparators'
import { HoldingsBar } from './HoldingsBar'
import { StyleBox } from './StyleBox'
import { StyleProfile } from './StyleProfile'
import './SummaryProfile.css'

export interface SummaryProfileProps {
  strategyId: string
  /** The backtest's name as the run recorded it. */
  name: string
  indexId: string | undefined
  /** The run's own currency. */
  currency: string
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
 * Summary's left column (BU-294): what the backtest is, what it holds and
 * how it did, beside the chart that shows it. The holdings range and the
 * style box are provisional tables until py-beacon names its own.
 */
export function SummaryProfile({
  strategyId,
  name,
  indexId,
  currency,
  comparators,
  figures
}: SummaryProfileProps): ReactElement {
  const options = useAnalysisOptions()
  const analytics = useAnalytics(strategyId)
  const answer = analytics.data?.status === 'computed' ? analytics.data.analytics : undefined
  const specOf = (id: string): StatisticSpec | undefined =>
    options.data?.statistics.find((statistic) => statistic.id === id)

  return (
    <div className="summary-profile">
      <div className="summary-titles">
        <Title label="Backtest" value={name} />
        <Title label="Index" value={indexId ?? '—'} />
        <Title label="Benchmark" value={comparators.benchmark?.id ?? 'None'} />
      </div>

      <HoldingsBar
        range={frameOf(answer, 'holdings_range')}
        days={frameOf(answer, 'holdings_distribution')}
      />

      <div className="summary-profile-pair">
        <Section title="Style">
          <StyleBox
            frame={frameOf(answer, 'style_box')}
            positions={frameOf(answer, 'style_positions')}
            classification={frameOf(answer, 'style_classification')}
            spec={specOf('style_box')}
          />
        </Section>
        <StyleProfile
          classification={frameOf(answer, 'style_classification')}
          classificationSpec={specOf('style_classification')}
          fundamentals={frameOf(answer, 'characteristics')}
          currency={currency}
        />
      </div>

      <Section title="Headline statistics">
        <HeadlineStatistics comparators={comparators} figures={figures} />
      </Section>
    </div>
  )
}

/** A heading over its value: what the run is and what it is measured against. */
function Title({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="summary-title">
      <span className="summary-title-label">{label}</span>
      <span className="summary-title-value">{value}</span>
    </div>
  )
}

function frameOf(answer: Analytics | undefined, id: string): TableFrame | undefined {
  const value = answer?.statistics[id]
  return value?.kind === 'table' ? value.point : undefined
}

/**
 * The figures the strip carried, as the strip drew them (a name over a
 * larger figure), three to a row (Karan, 2026-11-19): the run's return, each
 * comparator's and the gap to it, then risk.
 */
function HeadlineStatistics({
  comparators,
  figures
}: Pick<SummaryProfileProps, 'comparators' | 'figures'>): ReactElement {
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
        label={`Against the ${label.toLowerCase()}`}
        value={signedPercent(lead, 2)}
        tone={tone(lead)}
      />
    ]
  }
  return (
    <div className="headline-statistics">
      <Stat label="Total return" value={signedPercent(figures.total)} tone={tone(figures.total)} />
      {against('Index', comparators.index)}
      {against('Benchmark', comparators.benchmark)}
      <Stat label="CAGR" value={percent(figures.cagr)} />
      <Stat label="Volatility" value={percent(figures.volatility)} />
      <Stat label="Max drawdown" value={signedPercent(figures.drawdown)} tone="negative" />
    </div>
  )
}
