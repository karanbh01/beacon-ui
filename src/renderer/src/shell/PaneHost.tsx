import type { CSSProperties, ReactElement } from 'react'
import { splitFor, useChrome, type SplitAxis } from '../state/chrome'
import { Pane } from './Pane'
import { PaneDivider } from './PaneDivider'
import { dividersFor, gridAreaFor, panesFor } from './paneGrid'
import './PaneHost.css'

export interface PaneHostProps {
  page: string
}

/** `minmax(0, …)` on both tracks, or a wide table stretches its pane. */
function tracks(first: number): string {
  return `minmax(0, ${String(first)}fr) minmax(0, ${String(1 - first)}fr)`
}

/**
 * Lays out the panes the chrome's Layout Menu selected (BU-55), at the sizes
 * its dividers were dragged to (BU-69).
 *
 * The host owns the arrangement and nothing else — tabs, active state and the
 * new-tab menu all belong to a `Pane`, which is what makes each pane a
 * workspace rather than a viewport.
 *
 * A layout change is NOT destructive. Tabs keep the pane they were put in, so
 * collapsing to one strip folds them together and splitting again puts every
 * one back. `visiblePane` is where that folding happens.
 */
export function PaneHost({ page }: PaneHostProps): ReactElement {
  const layout = useChrome((state) => state.layout)
  const split = useChrome((state) => splitFor(state.splits, state.layout))
  const setSplit = useChrome((state) => state.setSplit)
  const resetSplit = useChrome((state) => state.resetSplit)

  const panes = panesFor(layout)
  const style: CSSProperties = {
    gridTemplateColumns: tracks(split.x),
    gridTemplateRows: tracks(split.y)
  }

  return (
    <div className="pane-host" data-layout={layout} style={style}>
      {panes.map((pane, index) => (
        <Pane
          key={`${page}-${String(index)}`}
          page={page}
          index={index}
          paneCount={panes.length}
          style={gridAreaFor(pane)}
        />
      ))}

      {dividersFor(panes).map(({ axis, ...area }) => (
        <PaneDivider
          key={axis}
          axis={axis}
          value={split[axis]}
          style={area}
          onChange={(value) => {
            setSplit(layout, axis satisfies SplitAxis, value)
          }}
          onReset={() => {
            resetSplit(layout, axis)
          }}
        />
      ))}
    </div>
  )
}
