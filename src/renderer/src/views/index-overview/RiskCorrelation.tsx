import type { ReactElement } from 'react'
import { Calculating } from '../../components/Calculating/Calculating'
import { Section } from '../../components/Section/Section'
import { useThemeMode } from '../../state/theme'
import { useAnalysisOptions, useAnalytics } from '../shared/analyticsQueries'
import { useInstrument } from '../shared/beaconQueries'
import { ViewEmpty } from '../shared/ViewState'
import { ROLE_NAMES, useComparators } from './comparators'
import { CrisisPeriods } from './CrisisPeriods'
import { MarketCorrelation } from './MarketCorrelation'
import { ReturnDistribution } from './ReturnDistribution'
import { RiskFigures } from './RiskFigures'
import { RiskFrontier } from './RiskFrontier'

/** Under the frontier, in this order (Karan, 2026-11-22). */
const RISK_FIGURES = [
  'volatility',
  'max_drawdown',
  'beta',
  'downside_deviation',
  'downside_tracking_error',
  'up_capture',
  'down_capture'
]

/**
 * The frontier cloud's names on weekly returns, as the frontier is measured
 * (py-beacon BN-454); `weight` gives every portfolio's latest.
 */
const CLOUD_QUERY = {
  columns: ['annualised_return', 'volatility', 'last_held', 'in_index_at_end', 'weight'],
  frequency: 'weekly'
} as const

/** Under the return distribution: the shape its bars draw (Karan, 2026-11-22). */
const SHAPE_FIGURES = ['tail_ratio', 'skew', 'excess_kurtosis']

/**
 * Overview → Risk & Correlation (BU-176; laid out again 2026-11-21).
 *
 * Two columns (Karan, 2026-11-21): on the left, how the fund moves with the
 * markets and how it came through the crises; on the right, where it sits
 * among the names it could have held, its risk figures, and how bad an
 * ordinary bad day is. Each column runs on by itself, so the figures under
 * the frontier do not push the crises down (2026-11-22). All of it from the
 * run's analytics, so nothing here is worked out in the app.
 */
export function RiskCorrelation({ strategyId }: { strategyId: string }): ReactElement {
  const mode = useThemeMode()
  const analytics = useAnalytics(strategyId)
  const options = useAnalysisOptions()
  const comparators = useComparators(strategyId)
  const instrument = useInstrument(strategyId, CLOUD_QUERY)

  if (analytics.isPending || options.isPending) {
    return <Calculating label="Loading" subject={strategyId} />
  }
  const answer = analytics.data?.status === 'computed' ? analytics.data.analytics : undefined
  if (answer === undefined) {
    return (
      <ViewEmpty figure="plot">
        This run&apos;s risk figures are not worked out yet. Run the backtest again to see them.
      </ViewEmpty>
    )
  }

  const names = {
    index: comparators.benchmarkIsIndex ? ROLE_NAMES.both : ROLE_NAMES.index,
    benchmark: ROLE_NAMES.benchmark
  }
  const specOf = (id: string) => options.data?.statistics.find((each) => each.id === id)

  return (
    <div className="risk-face">
      <div className="risk-column">
        <MarketCorrelation
          answer={answer}
          mode={mode}
          spec={specOf('market_correlations')}
          indexName={names.index}
        />
        <Section title="Crises">
          <CrisisPeriods answer={answer} mode={mode} names={names} />
        </Section>
      </div>
      <div className="risk-column">
        {/* Each chart with its figures close under it, as one answer (Karan, 2026-11-22). */}
        <div className="risk-with-figures">
          <Section title="Efficient frontier">
            <RiskFrontier answer={answer} instrument={instrument.data} mode={mode} names={names} />
          </Section>
          <Section title="Risk figures">
            <RiskFigures
              answer={answer}
              statistics={options.data?.statistics ?? []}
              names={names}
              figures={RISK_FIGURES}
            />
          </Section>
        </div>
        {/* The shape the distribution's bars draw, in its section (Karan, 2026-11-23). */}
        <ReturnDistribution answer={answer} mode={mode} names={names}>
          <RiskFigures
            answer={answer}
            statistics={options.data?.statistics ?? []}
            names={names}
            figures={SHAPE_FIGURES}
          />
        </ReturnDistribution>
      </div>
    </div>
  )
}
