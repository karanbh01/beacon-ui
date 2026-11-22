import type { ReactElement } from 'react'
import { Calculating } from '../../components/Calculating/Calculating'
import { Section } from '../../components/Section/Section'
import { useThemeMode } from '../../state/theme'
import { useAnalysisOptions, useAnalytics } from '../shared/analyticsQueries'
import { ViewEmpty } from '../shared/ViewState'
import { ROLE_NAMES, useComparators } from './comparators'
import { CrisisPeriods } from './CrisisPeriods'
import { MarketCorrelation } from './MarketCorrelation'
import { ReturnDistribution } from './ReturnDistribution'
import { RiskFrontier } from './RiskFrontier'

/**
 * Overview → Risk & Correlation (BU-176; laid out again 2026-11-21).
 *
 * Four answers in a two-by-two (Karan, 2026-11-21): above, how the fund moves
 * with the markets beside where it sits among the names it could have held;
 * below, how it came through the crises beside how bad an ordinary bad day
 * is. All of it from the run's analytics, so nothing here is worked out in
 * the app.
 */
export function RiskCorrelation({ strategyId }: { strategyId: string }): ReactElement {
  const mode = useThemeMode()
  const analytics = useAnalytics(strategyId)
  const options = useAnalysisOptions()
  const comparators = useComparators(strategyId)

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
      <MarketCorrelation
        answer={answer}
        mode={mode}
        spec={specOf('market_correlations')}
        indexName={names.index}
      />
      <Section title="Efficient frontier">
        <RiskFrontier answer={answer} mode={mode} names={names} />
      </Section>
      <Section title="Crises">
        <CrisisPeriods answer={answer} mode={mode} names={names} />
      </Section>
      <ReturnDistribution answer={answer} mode={mode} names={names} />
    </div>
  )
}
