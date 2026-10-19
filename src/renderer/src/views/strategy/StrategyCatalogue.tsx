import { useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Card } from '../../components/Card/Card'
import { Field } from '../../components/Field/Field'
import { Table, type Column } from '../../components/Table/Table'
import { isDocumentId } from '../../api/ids'
import { ViewEmpty } from '../shared/ViewState'
import type { StoredStrategy } from '../shared/strategyDocuments'
import { KINDS } from './strategyDraft'
import '../index-definition/IndexOverview.css'

/**
 * What strategies exist, and the way to write one — Index Definition's
 * catalogue, for strategies: the same list, the same "New…" card asking for
 * the id first, the same quiet Delete. A row the engine says cannot run (its
 * index has gone) says why in the list rather than on the first backtest.
 */
export function StrategyCatalogue({
  strategies,
  onOpen,
  onDelete
}: {
  strategies: readonly StoredStrategy[]
  onOpen: (id: string) => void
  onDelete: (strategy: StoredStrategy) => void
}): ReactElement {
  const [naming, setNaming] = useState(false)
  const [id, setId] = useState('')
  const problem = idProblem(
    id,
    strategies.some((strategy) => strategy.id === id.trim())
  )

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
          New strategy…
        </Button>
      )}

      {naming && (
        <Card title="New strategy" className="index-overview-new">
          <Field label="Strategy id" width={240}>
            <input
              className="index-overview-input"
              value={id}
              maxLength={64}
              autoFocus
              aria-label="Strategy id"
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

      {strategies.length === 0 && (
        <ViewEmpty figure="drawer">
          This engine has no stored strategies yet — “New strategy…” starts one. A strategy holds an
          index: the index as defined, tracked, or beaten.
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
function idProblem(id: string, taken: boolean): string | undefined {
  const value = id.trim()
  if (value === '') return 'A strategy needs an id.'
  // "compare" and "runs" are routes under /strategies, not ids (BN-313).
  if (value === 'compare' || value === 'runs') return `“${value}” is reserved by the engine.`
  if (!isDocumentId(value)) return 'Letters, digits, dash and underscore only, up to 64 characters.'
  if (taken) return `${value} already exists — open it from the list instead.`
  return undefined
}
