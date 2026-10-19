import { useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { isAbsent, useBacktestRecords, useOverview } from '../shared/beaconQueries'
import { describeSkipped } from '../shared/pickers'
import { useStrategyCatalogue } from '../shared/strategyDocuments'
import type { Period } from '../shared/periods'
import { FlowsAum } from './FlowsAum'
import { Implementation } from './Implementation'
import { RiskCorrelation } from './RiskCorrelation'
import { StatisticsDetail } from './StatisticsDetail'
import { Summary } from './Summary'
import './IndexOverviewView.css'

type Face = 'summary' | 'implementation' | 'statistics' | 'risk' | 'flows'

// Karan's order: what it did, how it was carried out, then the detail.
const FACES: readonly { value: Face; label: string }[] = [
  { value: 'summary', label: 'Summary' },
  { value: 'implementation', label: 'Implementation' },
  { value: 'statistics', label: 'Statistics Detail' },
  { value: 'risk', label: 'Risk & Correlation' },
  { value: 'flows', label: 'Flows & AUM' }
]

/**
 * Beacon View → Overview. Figma 234:8016.
 *
 * A stored strategy's latest run, since py-beacon 0.9.0 read every Beacon
 * View answer from one. Five faces: the Summary is the whole-period read;
 * Implementation and Flows & AUM are what the fund did that the index did
 * not (they were to be tabs of their own, and live here because they are
 * the same run asked different questions); Statistics Detail and Risk &
 * Correlation are what a reader asks next.
 *
 * Sub-tabs on a SegmentedControl rather than a second row of Tab chips,
 * which would compete with the real tabs above. The period and the
 * comparators chosen for correlation are held here, so a choice made on one
 * face survives a move to the other.
 */
export function IndexOverviewView({ tab, subject, pane }: ViewProps): ReactElement {
  // `pinnedDoc` is still read: a tab saved in a preset while this view was
  // pinned keeps working (BU-166).
  const strategyId = subject ?? tab.pinnedDoc ?? ''
  const overview = useOverview(strategyId)
  const catalogue = useStrategyCatalogue()
  const runs = useBacktestRecords()
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)
  const setSubject = useWorkspace((state) => state.setSubject)

  const [face, setFace] = useState<Face>('summary')
  const [period, setPeriod] = useState<Period>('annual')
  const [comparators, setComparators] = useState<string[]>([])

  /*
   * The header's line, and what the catalogue could not read (BN-174).
   *
   * The query bar suggests from that catalogue, so a skipped strategy is one
   * a reader cannot reach and cannot see is missing — the bar looks the
   * same either way. Silent at zero, which is the ordinary case.
   */
  const meta = useMemo(() => {
    const parts: string[] = []
    if (overview.data !== undefined) {
      parts.push(
        `${overview.data.name} · ${overview.data.index_id} · ${String(overview.data.observations)} observations`
      )
    }
    const short = describeSkipped(catalogue.skipped)
    if (short !== undefined) parts.push(short)
    return parts.length === 0 ? undefined : parts.join(' · ')
  }, [overview.data, catalogue.skipped])

  /*
   * What it can be measured against: other strategies with a run. The
   * engine compares runs and nothing else, so a strategy never run is not
   * a choice, and a strategy correlated with itself is 1.000.
   */
  const others = useMemo(
    () =>
      (runs.data?.backtests ?? []).map((run) => run.strategy_id).filter((id) => id !== strategyId),
    [runs.data, strategyId]
  )

  const noRun = overview.isError && isAbsent(overview.error)

  const openBacktest = (): void => {
    openOrRetarget({
      page: 'beacon-view',
      pane,
      viewKind: 'backtest',
      title: strategyId,
      subject: strategyId
    })
  }

  return (
    <div className="index-overview-view">
      {/*
        This page's subject lives here (BU-166): Overview names the strategy
        and Weights, Attribution and Comparison follow it. The same query
        bar every subject-bearing view uses — tab-completion, arrows, commit
        on Enter — searching the stored strategies. Ids are taken as typed:
        a strategy's id is the user's, and case is part of it.
      */}
      <PaneHeader
        kind="query"
        subject={strategyId}
        index={catalogue.rows}
        {...(meta === undefined ? {} : { meta })}
        onQuery={(next) => {
          setSubject(tab.id, next)
        }}
        controls={
          <>
            <Button
              disabled={strategyId === ''}
              onClick={() => {
                openOrRetarget({
                  page: 'strategy-builder',
                  pane,
                  viewKind: 'strategy',
                  title: strategyId,
                  subject: strategyId
                })
              }}
            >
              Open strategy
            </Button>
            <Button disabled={strategyId === ''} onClick={openBacktest}>
              Backtest…
            </Button>
            <Button chevron>Export</Button>
          </>
        }
      />

      <SegmentedControl
        segments={FACES}
        value={face}
        onChange={setFace}
        label="Overview section"
        className="overview-faces"
      />

      {strategyId === '' && (
        <ViewEmpty figure="ticker">Choose a strategy to see how its latest run did.</ViewEmpty>
      )}
      {overview.isPending && strategyId !== '' && <ViewLoading what={strategyId} />}
      {noRun && (
        <ViewEmpty figure="plot">
          {strategyId} has no run yet. Backtest it to see one here.
        </ViewEmpty>
      )}
      {overview.isError && !noRun && <ViewError error={overview.error} />}

      {overview.isSuccess && (
        <OverviewFace
          face={face}
          strategyId={strategyId}
          period={period}
          onPeriod={setPeriod}
          comparators={comparators}
          onComparators={setComparators}
          others={others}
        />
      )}
    </div>
  )
}

interface OverviewFaceProps {
  face: Face
  strategyId: string
  period: Period
  onPeriod: (period: Period) => void
  comparators: string[]
  onComparators: (comparators: string[]) => void
  others: readonly string[]
}

function OverviewFace({ face, strategyId, ...shared }: OverviewFaceProps): ReactElement {
  switch (face) {
    case 'summary':
      return <Summary strategyId={strategyId} />
    case 'implementation':
      return <Implementation strategyId={strategyId} />
    case 'statistics':
      return (
        <StatisticsDetail
          strategyId={strategyId}
          period={shared.period}
          onPeriod={shared.onPeriod}
        />
      )
    case 'risk':
      return (
        <RiskCorrelation
          strategyId={strategyId}
          period={shared.period}
          onPeriod={shared.onPeriod}
          benchmarks={shared.comparators}
          onBenchmarks={shared.onComparators}
          others={shared.others}
        />
      )
    case 'flows':
      return <FlowsAum strategyId={strategyId} />
  }
}
