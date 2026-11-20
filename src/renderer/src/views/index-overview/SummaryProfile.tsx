import type { ReactElement } from 'react'
import type { Analytics, StatisticSpec, TableFrame } from '../../api/analytics'
import { Section } from '../../components/Section/Section'
import { useAnalysisOptions, useAnalytics } from '../shared/analyticsQueries'
import type { Comparators } from './comparators'
import { Exposures } from './Exposures'
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
}

/**
 * Summary's left column (BU-294): what the backtest is and what it holds,
 * beside the figures and the chart that show how it did. The holdings range and the
 * style box are provisional tables until py-beacon names its own.
 */
export function SummaryProfile({
  strategyId,
  name,
  indexId,
  currency,
  comparators
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
            benchmarkIsIndex={comparators.benchmarkIsIndex}
          />
        </Section>
        <StyleProfile
          classification={frameOf(answer, 'style_classification')}
          classificationSpec={specOf('style_classification')}
          fundamentals={frameOf(answer, 'characteristics')}
          fundamentalsSpec={specOf('characteristics')}
          currency={currency}
        />
      </div>

      <Exposures
        frame={frameOf(answer, 'group_exposures')}
        benchmarkIsIndex={comparators.benchmarkIsIndex}
      />
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
