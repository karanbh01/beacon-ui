import { useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Dialog } from '../../components/Dialog/Dialog'
import { Section } from '../../components/Section/Section'
import { Table, type Column } from '../../components/Table/Table'
import { FlowsForm } from './FlowsForm'
import type { SectionProps } from './fields'
import { flowRows, type FlowRow } from './flowRows'

/**
 * Capital and flows (Karan, 2026-10-17): set in a pop-up, listed here.
 *
 * The table is the money the run will see, a row per event — so what was
 * chosen in the pop-up can be checked at a glance without opening it again.
 */
export function MoneySection({ setup, onChange, options }: SectionProps): ReactElement {
  const [editing, setEditing] = useState(false)
  const rows = useMemo(() => flowRows(setup, options), [setup, options])
  const columns = setup.classes.length === 0 ? COLUMNS.filter((c) => c.key !== 'class') : COLUMNS

  return (
    <Section
      title="Capital and flows"
      className="backtest-section"
      aside={
        <Button
          onClick={() => {
            setEditing(true)
          }}
        >
          Capital and flows…
        </Button>
      }
    >
      {/* As wide as its columns, and narrower with the pane down to their floors
          (Karan, 0.2.1): side by side, it held its width and ran under the next. */}
      <div className="backtest-flows-table">
        <Table
          columns={columns}
          rows={rows}
          getRowId={(row) => row.key}
          maxBodyHeight={280}
          fillWidth
        />
      </div>
      {setup.flows.length === 0 && (
        <p className="backtest-note type-11">No money is paid in or taken out after the start.</p>
      )}

      {editing && (
        <Dialog
          title="Capital and flows"
          note="Enter the starting amount for each share class, and any money paid in or taken out during the backtest."
          width={760}
          onClose={() => {
            setEditing(false)
          }}
        >
          <FlowsForm setup={setup} onChange={onChange} options={options} />
        </Dialog>
      )}
    </Section>
  )
}

const COLUMNS: readonly Column<FlowRow>[] = [
  {
    key: 'class',
    header: 'Class',
    width: 80,
    minWidth: 44,
    emphasis: true,
    render: (row) => row.shareClass
  },
  { key: 'flow', header: 'Flow', width: 160, minWidth: 96, render: (row) => row.flow },
  { key: 'when', header: 'When', width: 130, minWidth: 84, render: (row) => row.when },
  {
    key: 'amount',
    header: 'Amount',
    width: 220,
    minWidth: 96,
    align: 'right',
    render: (row) => row.amount
  }
]
