import { useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty } from '../shared/ViewState'
import { useIndices } from '../shared/strategyQueries'
import { WeightDetail } from './WeightDetail'
import { WeightsOverTime } from './WeightsOverTime'
import type { Frequency } from './weightsHistory'
import './IndexWeightsView.css'

type Face = 'portfolio' | 'active' | 'detail'

const FACES: readonly { value: Face; label: string }[] = [
  { value: 'portfolio', label: 'Portfolio' },
  { value: 'active', label: 'Active' },
  { value: 'detail', label: 'Weight Detail' }
]

/**
 * Beacon View → Weights (BU-177).
 *
 * Three faces. Weight Detail is the cross-section this pane always was —
 * what was held at one date. Portfolio and Active are the two questions it
 * could not answer: how those holdings MOVED, and how they differ from a
 * benchmark, which is most of what anyone looks at weights for.
 *
 * The benchmark is held here rather than per face, because it is one
 * question asked on two of them. The frequency is not: it belongs to the
 * time series and Weight Detail has no use for it.
 */
export function IndexWeightsView({ tab, subject, pane }: ViewProps): ReactElement {
  // The index, resolved from Overview (BU-166). Clicking a row opens
  // Drilldown for that constituent rather than storing it here: a linked tab
  // holds no subject of its own, and this page's subject is the index.
  const indexId = subject ?? tab.pinnedDoc ?? ''
  const indices = useIndices()

  const [face, setFace] = useState<Face>('detail')
  const [frequency, setFrequency] = useState<Frequency>('rebalance')
  const [groupBy, setGroupBy] = useState('')
  const [benchmark, setBenchmark] = useState('')
  const [asof, setAsof] = useState('')

  /** Anything but itself: an index is not its own benchmark. */
  const others = useMemo(
    () => (indices.data?.indices ?? []).map((index) => index.id).filter((id) => id !== indexId),
    [indices.data, indexId]
  )

  return (
    <div className="index-weights-view">
      <PaneHeader kind="fields" controls={<Button chevron>Export</Button>}>
        <SegmentedControl
          segments={FACES}
          value={face}
          onChange={setFace}
          label="Weights section"
        />
      </PaneHeader>

      {indexId === '' && <ViewEmpty>Name an index in Overview — this pane follows it.</ViewEmpty>}

      {indexId !== '' && face === 'detail' && (
        <WeightDetail
          indexId={indexId}
          page={tab.page}
          pane={pane}
          asof={asof}
          onAsof={setAsof}
          benchmark={benchmark}
          onBenchmark={setBenchmark}
          others={others}
        />
      )}

      {indexId !== '' && face !== 'detail' && (
        <WeightsOverTime
          indexId={indexId}
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
