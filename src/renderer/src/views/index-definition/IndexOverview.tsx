import type { ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Table, type Column } from '../../components/Table/Table'
import { ViewEmpty } from '../shared/ViewState'
import type { IndexDocument } from './pipeline'
import './IndexOverview.css'

export interface IndexOverviewProps {
  indices: readonly IndexDocument[]
  onOpen: (id: string) => void
  /** Omitted where deleting is not offered — there is no engine, say. */
  onDelete?: (index: IndexDocument) => void
  /**
   * Offer "New index…", opening the form on a new index. Omitted where the
   * list is for choosing one to look at: the constituent preview, which has
   * nothing to preview in an unsaved id.
   */
  onNew?: () => void
}

const COLUMNS: readonly Column<IndexDocument>[] = [
  { key: 'name', header: 'Index', width: 240, emphasis: true, render: (row) => row.name },
  { key: 'id', header: 'Id', width: 140, render: (row) => row.id },
  {
    key: 'universe',
    header: 'Universe',
    width: 150,
    // A derived index has no universe of its own: it takes the parent's
    // constituents through the solve (BU-170).
    render: (row) => row.universe?.universe_id ?? '—'
  },
  {
    key: 'rebalance',
    header: 'Rebalance',
    width: 120,
    render: (row) => row.rebalancing_frequency
  },
  { key: 'currency', header: 'Ccy', width: 60, render: (row) => row.currency }
]

/**
 * The same columns, plus a delete (BU-151).
 *
 * Every row gets one: no index is seeded, so unlike a universe there is no
 * row the engine would refuse.
 */
function columns(
  onDelete: ((index: IndexDocument) => void) | undefined
): readonly Column<IndexDocument>[] {
  if (onDelete === undefined) return COLUMNS

  return [
    ...COLUMNS,
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
            // The row opens the definition; the button must not.
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

/**
 * What index definitions exist, and the way to make one (BU-95).
 *
 * The create route had been reachable only by accident. Opening the tab from
 * the sidebar sent its title as an index id, the engine 404'd, and
 * `useIndexDraft` reads a 404 as "this is a new index" — so the blank editor
 * everyone used to create with was a misread error. BU-87 stopped the bad
 * request and took the create route with it.
 *
 * `GET /indices` returns whole documents rather than summaries, so every
 * column here is free.
 */
export function IndexOverview({
  indices,
  onOpen,
  onDelete,
  onNew
}: IndexOverviewProps): ReactElement {
  return (
    <div className="index-overview">
      {/* Straight to the form (Karan, 0.2.1): the id is a field in it, checked there. */}
      {onNew !== undefined && (
        <Button variant="accent" onClick={onNew}>
          New index…
        </Button>
      )}

      {indices.length === 0 && (
        <ViewEmpty figure="drawer">
          No index definitions yet.{' '}
          {onNew !== undefined ? '“New index…” starts one.' : 'Start one in Index Definition.'}
        </ViewEmpty>
      )}

      {indices.length > 0 && (
        <>
          <Table
            columns={columns(onDelete)}
            rows={indices}
            getRowId={(row) => row.id}
            onSelectRow={(row) => {
              onOpen(row.id)
            }}
            maxBodyHeight={520}
          />
          <p className="index-overview-footnote type-11">
            {indices.length.toLocaleString('en-US')} index
            {indices.length === 1 ? '' : 'es'} · click a row to open one
          </p>
        </>
      )}
    </div>
  )
}
