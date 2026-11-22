import { useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Calculating } from '../../components/Calculating/Calculating'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError } from '../shared/ViewState'
import { isAbsent, useOverview } from '../shared/beaconQueries'
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
 * which would compete with the real tabs above. The period is held
 * here, so a choice made on one face survives a move to another.
 */
export function IndexOverviewView({ tab, subject, pane }: ViewProps): ReactElement {
  // `pinnedDoc` is still read: a tab saved in a preset while this view was
  // pinned keeps working (BU-166).
  const strategyId = subject ?? tab.pinnedDoc ?? ''
  const overview = useOverview(strategyId)
  const catalogue = useStrategyCatalogue()
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)
  const setSubject = useWorkspace((state) => state.setSubject)

  const [face, setFace] = useState<Face>('summary')
  const [period, setPeriod] = useState<Period>('annual')

  /*
   * What the catalogue could not read (BN-174), on the header's line.
   *
   * The query bar suggests from that catalogue, so a skipped strategy is one
   * a reader cannot reach and cannot see is missing — the bar looks the
   * same either way. Silent at zero, which is the ordinary case. The run's
   * name and index are not repeated here: Summary's titles carry them
   * (Karan, 2026-11-20).
   */
  const meta = useMemo(() => describeSkipped(catalogue.skipped), [catalogue.skipped])

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
      {/* The orb, as the other views wait (Karan, 2026-11-20), however briefly. */}
      {overview.isPending && strategyId !== '' && (
        <Calculating label="Loading" subject={strategyId} />
      )}
      {noRun && (
        <ViewEmpty figure="plot">
          {strategyId} has no run yet. Backtest it to see one here.
        </ViewEmpty>
      )}
      {overview.isError && !noRun && <ViewError error={overview.error} />}

      {overview.isSuccess && (
        <OverviewFace face={face} strategyId={strategyId} period={period} onPeriod={setPeriod} />
      )}
    </div>
  )
}

interface OverviewFaceProps {
  face: Face
  strategyId: string
  period: Period
  onPeriod: (period: Period) => void
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
      return <RiskCorrelation strategyId={strategyId} />
    case 'flows':
      return <FlowsAum strategyId={strategyId} />
  }
}
