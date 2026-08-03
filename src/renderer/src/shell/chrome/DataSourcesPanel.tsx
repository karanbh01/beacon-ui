import type { ReactElement } from 'react'
import type { EngineStatus } from '@shared/ipc'
import { sourceRows } from './dataSources'
import { Popover } from './Popover'
import './DataSourcesPanel.css'

export interface DataSourcesPanelProps {
  open: boolean
  onClose: () => void
  engine: EngineStatus
  /** Opens the pane that can actually say something about coverage. */
  onManage: () => void
}

/** Figma 145:3460. 260 wide, heading, three rows, rule, an action. */
export function DataSourcesPanel({
  open,
  onClose,
  engine,
  onManage
}: DataSourcesPanelProps): ReactElement {
  return (
    <Popover open={open} onClose={onClose} label="Data sources" className="data-sources-panel">
      <p className="popover-heading">DATA SOURCES</p>

      {sourceRows(engine).map((row) => (
        // Not buttons: there is nothing to do to a source from here. Making
        // them look actionable would promise a control that does not exist.
        <p key={row.name} className="popover-row data-sources-row">
          {row.name}
          <span
            className={`popover-row-meta${row.tone === 'success' ? ' popover-row-success' : ''}`}
          >
            {row.status}
          </span>
        </p>
      ))}

      <div className="popover-divider" />

      <button
        type="button"
        className="popover-row popover-row-accent"
        onClick={() => {
          onManage()
          onClose()
        }}
      >
        Manage sources…
      </button>
    </Popover>
  )
}
