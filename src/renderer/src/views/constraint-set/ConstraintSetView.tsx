import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
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
import { ConstraintList } from './ConstraintList'
import { isDirty } from './constraints'
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
          {/*
            The list is a component now (BU-170): an optimised index's
            derivation stores the same rows, so the editing belongs to both
            rather than to whichever view needed it first.
          */}
          <ConstraintList
            title={`Constraints · ${draft.name}`}
            rows={draft.constraints ?? []}
            types={types}
            onChange={(rows) => {
              edit((current) => ({ ...current, constraints: [...rows] }))
            }}
          />

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
