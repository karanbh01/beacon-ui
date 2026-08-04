import type { ReactElement } from 'react'
import { useChrome } from '../state/chrome'
import { Pane } from './Pane'
import { gridAreaFor, panesFor } from './paneGrid'
import './PaneHost.css'

export interface PaneHostProps {
  page: string
}

/**
 * Lays out the panes the chrome's Layout Menu selected (BU-55).
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
  const panes = panesFor(layout)

  return (
    <div className="pane-host" data-layout={layout}>
      {panes.map((pane, index) => (
        <Pane
          key={`${page}-${String(index)}`}
          page={page}
          index={index}
          paneCount={panes.length}
          style={gridAreaFor(pane)}
        />
      ))}
    </div>
  )
}
