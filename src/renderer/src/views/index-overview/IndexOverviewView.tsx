import { useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useOverview } from '../shared/beaconQueries'
import { describeSkipped } from '../shared/pickers'
import { useIndexCatalogue, useIndices } from '../shared/strategyQueries'
import type { Period } from '../shared/periods'
import { RiskCorrelation } from './RiskCorrelation'
import { StatisticsDetail } from './StatisticsDetail'
import { Summary } from './Summary'
import './IndexOverviewView.css'

type Face = 'summary' | 'statistics' | 'risk'

const FACES: readonly { value: Face; label: string }[] = [
  { value: 'summary', label: 'Summary' },
  { value: 'statistics', label: 'Statistics Detail' },
  { value: 'risk', label: 'Risk & Correlation' }
]

/**
 * Beacon View → Overview. Figma 234:8016.
 *
 * Three faces since BU-176. The Summary is what this pane always was —
 * whole-period metrics from `/overview`, with the period slices computed
 * from the level series the same response carried. The other two answer
 * what a reader asks next: how did it do per period, and how risky was it.
 *
 * Sub-tabs on a SegmentedControl rather than a second row of Tab chips,
 * which would compete with the real tabs above. The benchmark and the
 * period are held here, so a choice made on one face survives a move to the
 * other — they are the same question asked twice.
 */
export function IndexOverviewView({ tab, subject, pane }: ViewProps): ReactElement {
  // `pinnedDoc` is still read: a tab saved in a preset while this view was
  // pinned keeps working (BU-166).
  const indexId = subject ?? tab.pinnedDoc ?? ''
  const overview = useOverview(indexId)
  const catalogue = useIndexCatalogue()
  const indices = useIndices()
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)
  const setSubject = useWorkspace((state) => state.setSubject)

  const [face, setFace] = useState<Face>('summary')
  const [period, setPeriod] = useState<Period>('annual')
  const [benchmark, setBenchmark] = useState('')
  const [comparators, setComparators] = useState<string[]>([])

  /*
   * The header's line, and what the catalogue could not read (BN-174).
   *
   * The query bar suggests from that catalogue, so a skipped index is one
   * a reader cannot reach and cannot see is missing — the bar looks the
   * same either way. Silent at zero, which is the ordinary case.
   */
  const meta = useMemo(() => {
    const parts: string[] = []
    if (overview.data !== undefined) {
      parts.push(`${overview.data.name} · ${String(overview.data.observations)} observations`)
    }
    const short = describeSkipped(catalogue.skipped)
    if (short !== undefined) parts.push(short)
    return parts.length === 0 ? undefined : parts.join(' · ')
  }, [overview.data, catalogue.skipped])

  /** Anything but itself: an index correlated with itself is 1.000. */
  const others = useMemo(
    () => (indices.data?.indices ?? []).map((index) => index.id).filter((id) => id !== indexId),
    [indices.data, indexId]
  )

  return (
    <div className="index-overview-view">
      {/*
        This page's subject lives here (BU-166): Overview names the index and
        Weights, Attribution and Comparison follow it. The same query bar
        every subject-bearing view uses — tab-completion, arrows, commit on
        Enter — searching the index catalogue rather than instruments.
      */}
      <PaneHeader
        kind="query"
        subject={indexId}
        index={catalogue.rows}
        {...(meta === undefined ? {} : { meta })}
        onQuery={(next) => {
          setSubject(tab.id, next.toUpperCase())
        }}
        controls={
          <>
            <Button
              disabled={indexId === ''}
              onClick={() => {
                openOrRetarget({
                  page: 'strategy-builder',
                  pane,
                  viewKind: 'index-definition',
                  title: indexId,
                  subject: indexId
                })
              }}
            >
              Open in Strategy Builder
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

      {indexId === '' && <ViewEmpty>Choose an index to see how it has done.</ViewEmpty>}
      {overview.isPending && indexId !== '' && <ViewLoading what={indexId} />}
      {overview.isError && <ViewError error={overview.error} />}

      {overview.isSuccess && face === 'summary' && <Summary indexId={indexId} />}

      {overview.isSuccess && face === 'statistics' && (
        <StatisticsDetail
          indexId={indexId}
          period={period}
          onPeriod={setPeriod}
          benchmark={benchmark}
          onBenchmark={setBenchmark}
          others={others.map((id) => ({ value: id, label: id }))}
        />
      )}

      {overview.isSuccess && face === 'risk' && (
        <RiskCorrelation
          indexId={indexId}
          period={period}
          onPeriod={setPeriod}
          benchmarks={comparators}
          onBenchmarks={setComparators}
          others={others}
        />
      )}
    </div>
  )
}
