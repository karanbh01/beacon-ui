import type { ReactElement } from 'react'
import { PANE_GAP, type PaneBox } from './paneGeometry'

interface PaneGapsProps {
  boxes: readonly PaneBox[]
  /** The plot's left and right edges, inside the price scales. */
  left: number
  right: number
}

/**
 * py-beacon's stacked panels, each on its own axes with a gap between
 * (beacon/plot/accessors.py, _Performance).
 *
 * lightweight-charts draws its panes flush, with one left axis line running
 * down through all of them. So the separator is left invisible, and here
 * the upper pane gets its own bottom axis line, and a strip of canvas over
 * the top of the lower pane's axis line opens the gap. The separator is
 * still there under the line, so the panes still resize by dragging it.
 */
export function PaneGaps({ boxes, left, right }: PaneGapsProps): ReactElement {
  return (
    <>
      {boxes.slice(1).map((box) => (
        <span key={box.top} aria-hidden="true">
          <span
            className="level-chart-spine"
            style={{ top: box.top - 1, left: left - 1, width: right - left + 1 }}
          />
          <span
            className="level-chart-gap"
            style={{ top: box.top, left: left - 2, height: PANE_GAP }}
          />
        </span>
      ))}
    </>
  )
}
