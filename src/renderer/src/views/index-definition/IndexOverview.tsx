import { useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Card } from '../../components/Card/Card'
import { Field } from '../../components/Field/Field'
import { Table, type Column } from '../../components/Table/Table'
import { isDocumentId } from '../../api/ids'
import { ViewEmpty } from '../shared/ViewState'
import type { IndexDocument } from './pipeline'
import './IndexOverview.css'

export interface IndexOverviewProps {
  indices: readonly IndexDocument[]
  onOpen: (id: string) => void
  /** Omitted where deleting is not offered — there is no engine, say. */
  onDelete?: (index: IndexDocument) => void
}

const COLUMNS: readonly Column<IndexDocument>[] = [
  { key: 'name', header: 'Index', width: 240, emphasis: true, render: (row) => row.name },
  { key: 'id', header: 'Id', width: 140, render: (row) => row.id },
  {
    key: 'universe',
    header: 'Universe',
    width: 150,
    render: (row) => row.universe.universe_id ?? '—'
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
export function IndexOverview({ indices, onOpen, onDelete }: IndexOverviewProps): ReactElement {
  const [naming, setNaming] = useState(false)
  const [id, setId] = useState('')

  const taken = indices.some((index) => index.id === id.trim())
  const problem = idProblem(id, taken)

  const create = (): void => {
    if (problem !== undefined) return
    setNaming(false)
    setId('')
    onOpen(id.trim())
  }

  return (
    <div className="index-overview">
      {!naming && (
        <Button
          variant="accent"
          onClick={() => {
            setNaming(true)
          }}
        >
          New index…
        </Button>
      )}

      {naming && (
        <Card title="New index definition" className="index-overview-new">
          {/*
            The id is collected up front because it is the document's ADDRESS:
            py-beacon derives the URL from it and `IndexDetailsForm` locks it
            once saved. Checked against the engine's own rule here rather than
            after a failed save, which would report it as a 422.
          */}
          <Field label="Index id" width={240}>
            <input
              className="index-overview-input"
              value={id}
              maxLength={64}
              autoFocus
              aria-label="Index id"
              onChange={(event) => {
                setId(event.target.value)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') create()
              }}
            />
          </Field>

          <p className="index-overview-hint type-11">
            {problem ?? 'Letters, digits, dash and underscore. This becomes its address.'}
          </p>

          <div className="index-overview-actions">
            <Button variant="accent" onClick={create} disabled={problem !== undefined}>
              Create
            </Button>
            <Button
              onClick={() => {
                setNaming(false)
                setId('')
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {indices.length === 0 && (
        <ViewEmpty>
          This engine has no stored index definitions yet — “New index…” starts one.
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

/** What the engine, or the catalogue, will refuse — said before asking. */
function idProblem(id: string, taken: boolean): string | undefined {
  const value = id.trim()
  if (value === '') return 'An index needs an id.'
  if (!isDocumentId(value)) {
    return 'Letters, digits, dash and underscore only, up to 64 characters.'
  }
  if (taken) return `${value} already exists — open it from the list instead.`
  return undefined
}
