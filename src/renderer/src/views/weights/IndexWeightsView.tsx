import { useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty } from '../shared/ViewState'
import { useBacktestRecords } from '../shared/beaconQueries'
import { WeightDetail } from './WeightDetail'
import { WeightsOverTime } from './WeightsOverTime'
import type { Frequency } from './weightsHistory'
import './IndexWeightsView.css'

type Face = 'portfolio' | 'active' | 'detail'

const FACES: readonly { value: Face; label: string }[] = [
  { value: 'portfolio', label: 'Portfolio' },
  { value: 'active', label: 'Active' },
  { value: 'detail', label: 'Holdings Detail' }
]

/**
 * Beacon View → Holdings (BU-177; renamed from Weights, Karan 2026-10-19).
 *
 * Three faces. Holdings Detail is the cross-section this pane always was —
 * what was held at one date. Portfolio and Active are the two questions it
 * could not answer: how those holdings MOVED, and how they differ from a
 * benchmark, which is most of what anyone looks at weights for.
 *
 * The benchmark is held here rather than per face, because it is one
 * question asked on two of them. The frequency is not: it belongs to the
 * time series and Holdings Detail has no use for it.
 */
export function IndexWeightsView({ tab, subject, pane }: ViewProps): ReactElement {
  // The strategy, resolved from Overview (BU-166). Clicking a row opens
  // Drilldown for that constituent rather than storing it here: a linked tab
  // holds no subject of its own, and this page's subject is the strategy.
  const strategyId = subject ?? tab.pinnedDoc ?? ''
  const runs = useBacktestRecords()

  const [face, setFace] = useState<Face>('detail')
  const [frequency, setFrequency] = useState<Frequency>('rebalance')
  const [groupBy, setGroupBy] = useState('')
  const [benchmark, setBenchmark] = useState('')
  const [asof, setAsof] = useState('')
  // Holdings Detail opens empty and runs on request (Karan, 2026-10-19).
  const [ran, setRan] = useState(false)

  /** Other strategies with a run: weights are a run's, and none is its own benchmark. */
  const others = useMemo(
    () =>
      (runs.data?.backtests ?? []).map((run) => run.strategy_id).filter((id) => id !== strategyId),
    [runs.data, strategyId]
  )

  return (
    <div className="index-weights-view">
      <PaneHeader kind="fields" controls={<Button chevron>Export</Button>}>
        <SegmentedControl
          segments={FACES}
          value={face}
          onChange={setFace}
          label="Holdings section"
        />
      </PaneHeader>

      {strategyId === '' && (
        <ViewEmpty figure="ticker">Choose a strategy in Overview. This tab follows it.</ViewEmpty>
      )}

      {strategyId !== '' && face === 'detail' && (
        <WeightDetail
          strategyId={strategyId}
          page={tab.page}
          pane={pane}
          asof={asof}
          onAsof={setAsof}
          ran={ran}
          onRun={() => {
            setRan(true)
          }}
        />
      )}

      {strategyId !== '' && face !== 'detail' && (
        <WeightsOverTime
          strategyId={strategyId}
          active={face === 'active'}
          frequency={frequency}
          onFrequency={setFrequency}
          groupBy={groupBy}
          onGroupBy={setGroupBy}
          benchmark={benchmark}
          onBenchmark={setBenchmark}
          others={others}
        />
      )}
    </div>
  )
}
