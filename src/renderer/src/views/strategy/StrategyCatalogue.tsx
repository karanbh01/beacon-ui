import type { ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Table, type Column } from '../../components/Table/Table'
import { ViewEmpty } from '../shared/ViewState'
import type { StoredStrategy } from '../shared/strategyDocuments'
import { KINDS } from './strategyDraft'
import '../index-definition/IndexOverview.css'

/**
 * What strategies exist, and the way to write one: the list, "New strategy…"
 * opening the form straight away (Karan, 0.2.1), and a quiet Delete. A row
 * the engine says cannot run (its index has gone) says why in the list
 * rather than on the first backtest.
 */
export function StrategyCatalogue({
  strategies,
  onOpen,
  onNew,
  onDelete
}: {
  strategies: readonly StoredStrategy[]
  onOpen: (id: string) => void
  /** Open the form on a new, unnamed strategy; its id is a field in it. */
  onNew: () => void
  onDelete: (strategy: StoredStrategy) => void
}): ReactElement {
  return (
    <div className="index-overview">
      <Button variant="accent" onClick={onNew}>
        New strategy…
      </Button>

      {strategies.length === 0 && (
        <ViewEmpty figure="drawer">
          No strategies yet. “New strategy…” starts one. A strategy holds an index: as defined,
          tracked, or beaten.
        </ViewEmpty>
      )}

      {strategies.length > 0 && (
        <>
          <Table
            columns={columnsWith(onDelete)}
            rows={strategies}
            getRowId={(row) => row.id}
            onSelectRow={(row) => {
              onOpen(row.id)
            }}
            maxBodyHeight={520}
          />
          <p className="index-overview-footnote type-11">
            {strategies.length.toLocaleString('en-US')} strateg
            {strategies.length === 1 ? 'y' : 'ies'} · click a row to open one
          </p>
        </>
      )}
    </div>
  )
}

function columnsWith(onDelete: (strategy: StoredStrategy) => void): Column<StoredStrategy>[] {
  return [
    { key: 'name', header: 'Strategy', width: 240, emphasis: true, render: (row) => row.name },
    { key: 'id', header: 'Id', width: 150, render: (row) => row.id },
    { key: 'index', header: 'Index', width: 120, render: (row) => row.index_id },
    {
      key: 'kind',
      header: 'Kind',
      width: 180,
      render: (row) => KINDS.find((kind) => kind.value === row.strategy?.type)?.label ?? '—'
    },
    {
      key: 'problem',
      header: 'Can it run',
      width: 220,
      minWidth: 120,
      render: (row) => row.problem?.message ?? 'yes'
    },
    {
      key: 'delete',
      header: '',
      width: 60,
      align: 'right',
      render: (row) => (
        <button
          type="button"
          className="index-overview-delete type-11"
          aria-label={`Delete ${row.id}`}
          onClick={(event) => {
            // The row opens the strategy; the button must not.
            event.stopPropagation()
            onDelete(row)
          }}
        >
          Delete
        </button>
      )
    }
  ]
}

/** What the engine, or the catalogue, will refuse — said before asking. */
