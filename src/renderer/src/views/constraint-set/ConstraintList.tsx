import { Fragment, useState, type ReactElement } from 'react'
import { AddSlot } from '../../components/AddSlot/AddSlot'
import { Badge } from '../../components/Badge/Badge'
import { Card } from '../../components/Card/Card'
import type { ConstraintRow, ConstraintTypes } from '../shared/optimiseQueries'
import { ConstraintEditor } from './ConstraintEditor'
import { addRow, describeConstraint, moveRow, removeRowById, replaceRow } from './constraints'
import './ConstraintSetView.css'

export interface ConstraintListProps {
  title: string
  rows: readonly ConstraintRow[]
  /** Constraint class → the parameter names it accepts. */
  types: ConstraintTypes['types']
  onChange: (rows: readonly ConstraintRow[]) => void
  /** Shown in place of the add slot where the rows cannot be changed. */
  readOnly?: boolean
}

/**
 * The constraint list, wherever the rows are kept (BU-170).
 *
 * Two places store the same `ConstraintRow`: a constraint set, and an
 * optimised index's derivation. py-beacon stores one shape deliberately — the
 * edited row, the stored JSON and the solver's object are one thing in three
 * representations — so the editing belongs to both and lives here rather than
 * in the view that happened to need it first.
 *
 * Which selection is open is this component's business, not its caller's: a
 * list with one editor showing is a property of the list.
 */
export function ConstraintList({
  title,
  rows,
  types,
  onChange,
  readOnly = false
}: ConstraintListProps): ReactElement {
  const [editingId, setEditingId] = useState<string | undefined>(undefined)

  return (
    <Card title={title} flush className="constraint-card">
      {rows.map((constraint, index) => (
        <Fragment key={constraint.id}>
          <div
            className={
              constraint.id === editingId ? 'constraint-row is-selected' : 'constraint-row'
            }
          >
            <button
              type="button"
              className="constraint-main"
              aria-pressed={constraint.id === editingId}
              disabled={readOnly}
              onClick={() => {
                setEditingId(constraint.id === editingId ? undefined : constraint.id)
              }}
            >
              <span className="constraint-index">{String(index + 1).padStart(2, '0')}</span>
              <Badge>{constraint.type}</Badge>
              <span className="constraint-summary">{describeConstraint(constraint, types)}</span>
            </button>

            {!readOnly && (
              <span className="constraint-actions">
                <button
                  type="button"
                  className="constraint-action"
                  aria-label={`Move ${constraint.id} up`}
                  onClick={() => {
                    onChange(moveRow(rows, constraint.id, -1))
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="constraint-action"
                  aria-label={`Move ${constraint.id} down`}
                  onClick={() => {
                    onChange(moveRow(rows, constraint.id, 1))
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="constraint-action"
                  aria-label={`Remove ${constraint.id}`}
                  onClick={() => {
                    onChange(removeRowById(rows, constraint.id))
                    setEditingId(undefined)
                  }}
                >
                  ×
                </button>
              </span>
            )}
          </div>

          {constraint.id === editingId && (
            <ConstraintEditor
              constraint={constraint}
              catalogue={types}
              onApply={(next) => {
                onChange(replaceRow(rows, next))
                setEditingId(undefined)
              }}
              onCancel={() => {
                setEditingId(undefined)
              }}
            />
          )}
        </Fragment>
      ))}

      {!readOnly && (
        <AddSlot
          label="Add constraint…"
          indent={44}
          {...(Object.keys(types).length === 0
            ? { blocked: 'This engine publishes no constraint types' }
            : {})}
          onClick={() => {
            const first = Object.keys(types)[0]
            if (first === undefined) return
            onChange(addRow(rows, first))
          }}
        />
      )}
    </Card>
  )
}
