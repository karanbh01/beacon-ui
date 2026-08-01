import { Fragment, useEffect, useRef, useState, type ReactElement } from 'react'
import { AddSlot } from '../../components/AddSlot/AddSlot'
import { Badge } from '../../components/Badge/Badge'
import { Button } from '../../components/Button/Button'
import { Card } from '../../components/Card/Card'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Select } from '../../components/Select/Select'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import {
  useConstraintSet,
  useConstraintSets,
  useConstraintTypes,
  useSaveConstraintSet,
  useValidateConstraintSet,
  type ConstraintSet
} from '../shared/optimiseQueries'
import { ConstraintEditor } from './ConstraintEditor'
import {
  addConstraint,
  describeConstraint,
  isDirty,
  moveConstraint,
  removeConstraint,
  replaceConstraint
} from './constraints'
import './ConstraintSetView.css'

/**
 * Optimiser → Constraint Set. Figma 234:6904.
 *
 * The counterpart to the index methodology editor, and the demonstration of
 * what a published type catalogue buys: because
 * `/optimise/constraint-types` lists each class and its parameters, every
 * constraint renders named fields rather than free-text key/value pairs.
 */
export function ConstraintSetView({ tab, subject }: ViewProps): ReactElement {
  const sets = useConstraintSets()
  const catalogue = useConstraintTypes()

  const available = sets.data?.constraint_sets ?? []
  const selectedId = subject !== undefined && subject !== '' ? subject : (available[0]?.id ?? '')
  const stored = useConstraintSet(selectedId)

  const [draft, setDraft] = useState<ConstraintSet | undefined>(undefined)
  const [editingId, setEditingId] = useState<string | undefined>(undefined)
  const seededFor = useRef<string | undefined>(undefined)

  const save = useSaveConstraintSet()
  const validate = useValidateConstraintSet()
  const setSubject = useWorkspace((state) => state.setSubject)
  const setDirtyFlag = useWorkspace((state) => state.setDirty)

  const saved = stored.data
  useEffect(() => {
    if (saved === undefined || seededFor.current === selectedId) return
    seededFor.current = selectedId
    setDraft(saved)
  }, [saved, selectedId])

  const dirty = draft !== undefined && isDirty(draft, saved)
  useEffect(() => {
    setDirtyFlag(tab.id, dirty)
  }, [tab.id, dirty, setDirtyFlag])

  const types = catalogue.data?.types ?? {}
  const edit = (change: (current: ConstraintSet) => ConstraintSet): void => {
    setDraft((current) => (current === undefined ? current : change(current)))
  }

  return (
    <div className="constraint-set-view">
      <PaneHeader
        kind="fields"
        controls={
          <>
            <Button
              disabled={draft === undefined || validate.isPending}
              onClick={() => {
                if (draft !== undefined) validate.mutate(draft)
              }}
            >
              Validate
            </Button>
            <Button
              disabled={!dirty}
              onClick={() => {
                setDraft(saved)
              }}
            >
              Revert
            </Button>
            <Button
              variant="accent"
              disabled={!dirty || save.isPending}
              onClick={() => {
                if (draft !== undefined) save.mutate(draft)
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Select
          options={available.map((set) => ({ value: set.id, label: set.name }))}
          value={selectedId}
          placeholder="No constraint sets"
          label="Constraint set"
          disabled={available.length === 0}
          onChange={(value) => {
            seededFor.current = undefined
            setSubject(tab.id, value)
          }}
        />
      </PaneHeader>

      {sets.isPending && <ViewLoading what="constraint sets" />}
      {sets.isError && <ViewError error={sets.error} />}
      {stored.isError && <ViewError error={stored.error} />}
      {save.isError && <ViewError error={save.error} />}

      {sets.isSuccess && available.length === 0 && (
        <ViewEmpty>This engine has no stored constraint sets.</ViewEmpty>
      )}

      {draft !== undefined && (
        <>
          <Card title={`Constraints · ${draft.name}`} flush className="constraint-card">
            {(draft.constraints ?? []).map((constraint, index) => (
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
                    onClick={() => {
                      setEditingId(constraint.id === editingId ? undefined : constraint.id)
                    }}
                  >
                    <span className="constraint-index">{String(index + 1).padStart(2, '0')}</span>
                    <Badge>{constraint.type}</Badge>
                    <span className="constraint-summary">
                      {describeConstraint(constraint, types)}
                    </span>
                  </button>
                  <span className="constraint-actions">
                    <button
                      type="button"
                      className="constraint-action"
                      aria-label={`Move ${constraint.id} up`}
                      onClick={() => {
                        edit((current) => moveConstraint(current, constraint.id, -1))
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="constraint-action"
                      aria-label={`Move ${constraint.id} down`}
                      onClick={() => {
                        edit((current) => moveConstraint(current, constraint.id, 1))
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="constraint-action"
                      aria-label={`Remove ${constraint.id}`}
                      onClick={() => {
                        edit((current) => removeConstraint(current, constraint.id))
                        setEditingId(undefined)
                      }}
                    >
                      ×
                    </button>
                  </span>
                </div>

                {constraint.id === editingId && (
                  <ConstraintEditor
                    constraint={constraint}
                    catalogue={types}
                    onApply={(next) => {
                      edit((current) => replaceConstraint(current, next))
                      setEditingId(undefined)
                    }}
                    onCancel={() => {
                      setEditingId(undefined)
                    }}
                  />
                )}
              </Fragment>
            ))}

            <AddSlot
              label="Add constraint…"
              indent={44}
              onClick={() => {
                const first = Object.keys(types)[0]
                if (first === undefined) return
                edit((current) => addConstraint(current, first))
              }}
            />
          </Card>

          {validate.data !== undefined && (
            <div
              className={
                validate.data.valid ? 'constraint-findings is-valid' : 'constraint-findings'
              }
            >
              <p className="type-11">
                {validate.data.valid ? 'Valid — this set can be solved under.' : 'Blocked.'}
              </p>
              {validate.data.findings.map((finding) => (
                <p key={`${finding.code}-${finding.path}`} className="type-11">
                  <code>{finding.path}</code> {finding.message}
                </p>
              ))}
            </div>
          )}

          <p className="constraint-footnote type-11">
            {String((draft.constraints ?? []).length)} constraints ·{' '}
            {String(Object.keys(types).length)} types available on this engine · constraints apply
            simultaneously, so order is presentation only
          </p>
        </>
      )}
    </div>
  )
}
