import { useRef, useState, type ReactElement } from 'react'
import { useWidth } from '../../charts/useWidth'
import { Button } from '../../components/Button/Button'
import { Section } from '../../components/Section/Section'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { useComparators } from '../index-overview/comparators'
import { useAnalysisOptions } from '../shared/analyticsQueries'
import type { AssetView, InstrumentProfile } from '../shared/beaconQueries'
import { currenciesOf, inCurrency, partOf } from './profile'
import { CUTS, portfoliosOf, spanOfAsset, spansOf, type Cut, type Span } from './returnRisk'
import { FIGURE_WIDTH, LABEL_WIDTH, ReturnRiskTable } from './ReturnRiskTable'

/** The table's gap between columns, which its widths leave out. */
const GAP = 10

/**
 * Drilldown → Summary, under the top every face shares: the name's return
 * and risk over the run and each period against each portfolio, in one
 * table (Karan, 2026-11-27); how the fund holds it moved up to the top, and
 * the latest events went (Selection has them all). The periods are by rebalance or calendar, and as
 * many as reach the chart's right edge, the newest on the right and the
 * rest a step back, as the Overview's Performance table pages.
 */
export function DrilldownSummary({
  strategyId,
  identifier,
  profile,
  asset
}: {
  strategyId: string
  identifier: string
  profile: InstrumentProfile | undefined
  asset: AssetView | undefined
}): ReactElement {
  const options = useAnalysisOptions()
  const { benchmarkIsIndex } = useComparators(strategyId)
  const host = useRef<HTMLDivElement>(null)
  const width = useWidth(host)
  const [cut, setCut] = useState<Cut>('rebalance')
  // How many periods back from the newest the table starts.
  const [back, setBack] = useState(0)
  const inReturns = inCurrency(currenciesOf(asset).returns)
  const returnRisk = partOf(profile, 'return_risk')
  // An engine without the part still has the asset view's figures over the run.
  const against = asset?.against ?? 'index'
  const { run, periods } =
    returnRisk !== undefined
      ? spansOf(returnRisk, cut)
      : { run: asset === undefined ? undefined : spanOfAsset(asset, against), periods: [] }
  // A benchmark that is the index is one column, "Index/BM", as on the Overview (Karan, 2026-11-27).
  const portfolios = (returnRisk !== undefined ? portfoliosOf(returnRisk) : [against]).filter(
    (portfolio) => !(benchmarkIsIndex && portfolio === 'benchmark')
  )
  const names = options.data?.names
  // The Overview's short names: an index that is also the benchmark is both (Karan, 2026-11-20).
  const headerOf = (portfolio: string): string =>
    portfolio === 'index' && benchmarkIsIndex
      ? 'Index/BM'
      : portfolio === 'benchmark'
        ? 'BM'
        : (names?.portfolio?.[portfolio] ?? names?.book?.[portfolio] ?? portfolio)

  const group = (1 + portfolios.length) * (FIGURE_WIDTH + GAP)
  const room = Math.max(1, Math.floor((width - LABEL_WIDTH - GAP - group) / group))
  // Oldest first, so the window ends `back` periods short of the newest.
  const behind = Math.min(back, Math.max(0, periods.length - room))
  const end = periods.length - behind
  const shown = periods.slice(Math.max(0, end - room), end)
  const spans: Span[] = [...(run === undefined ? [] : [run]), ...shown]
  const first = shown[0]?.ends[0]
  const last = shown.at(-1)?.ends[1]

  return (
    <div className="drilldown-face" ref={host}>
      <Section
        title="Return and risk"
        aside={
          returnRisk !== undefined && (
            <span className="performance-pager">
              <SegmentedControl
                segments={CUTS}
                value={cut}
                onChange={(next) => {
                  setBack(0)
                  setCut(next)
                }}
                label="Periods"
              />
              {periods.length > room && (
                <>
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
                </>
              )}
            </span>
          )
        }
      >
        <ReturnRiskTable
          spans={spans}
          portfolios={portfolios}
          identifier={identifier}
          headerOf={headerOf}
          inReturns={inReturns}
        />
      </Section>
    </div>
  )
}
