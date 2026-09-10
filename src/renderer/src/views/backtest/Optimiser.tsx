import type { ReactElement } from 'react'
import { Field } from '../../components/Field/Field'
import { KV, KVList } from '../../components/KV/KV'
import { Select } from '../../components/Select/Select'
import { ConstraintList } from '../constraint-set/ConstraintList'
import type { ConstraintTypes } from '../shared/optimiseQueries'
import type { DerivationPayload } from '../index-definition/pipeline'
import type { BacktestSettings } from './settings'
import { OBJECTIVES } from './settings'

export interface OptimiserProps {
  settings: BacktestSettings
  onChange: (change: (current: BacktestSettings) => BacktestSettings) => void
  /** Constraint class → the parameter names it accepts. */
  types: ConstraintTypes['types']
  /** The subject's own derivation, when it is already an optimised index. */
  derivation?: DerivationPayload | undefined
}

/**
 * What to solve for, before the run (BU-174).
 *
 * There is no `optimised` flag in `BacktestRequest`, and there should not be:
 * optimising produces an INDEX, not a run. So this section describes a child
 * index — `POST /indices/{id}/optimise` derives and saves one — and the
 * backtest then runs against that child. It needs an id and a name for the
 * same reason any saved document does.
 */
export function Optimiser({ settings, onChange, types, derivation }: OptimiserProps): ReactElement {
  if (derivation !== undefined) return <Inherited derivation={derivation} />

  return (
    <>
      <div className="backtest-form-row">
        <Field label="Optimised index id" width={160}>
          <input
            className="backtest-input"
            aria-label="Optimised index id"
            value={settings.derivedId}
            onChange={(event) => {
              const derivedId = event.target.value
              onChange((current) => ({ ...current, derivedId }))
            }}
          />
        </Field>

        <Field label="Optimised index name" width={260}>
          <input
            className="backtest-input"
            aria-label="Optimised index name"
            value={settings.derivedName}
            onChange={(event) => {
              const derivedName = event.target.value
              onChange((current) => ({ ...current, derivedName }))
            }}
          />
        </Field>

        <Field label="Objective" width={180}>
          <Select
            className="backtest-inline-select"
            options={OBJECTIVES.map((value) => ({ value, label: value }))}
            value={settings.objective}
            onChange={(objective) => {
              onChange((current) => ({ ...current, objective }))
            }}
            label="Objective"
          />
        </Field>
      </div>

      <ConstraintList
        title="Constraints"
        rows={settings.constraints}
        types={types}
        onChange={(rows) => {
          onChange((current) => ({ ...current, constraints: [...rows] }))
        }}
      />
    </>
  )
}

/**
 * An index that is already derived is not optimised again.
 *
 * A second solve on top of a solved index would be a third document nobody
 * asked for, and its constraints are the parent's business. So the terms are
 * shown as what they are — this index's own — and the run goes straight to
 * the backtest.
 */
function Inherited({ derivation }: { derivation: DerivationPayload }): ReactElement {
  return (
    <KVList>
      <KV label="Parent index" value={derivation.source_index_id} />
      <KV label="Objective" value={derivation.objective} />
      <KV label="Constraints" value={`${String((derivation.constraints ?? []).length)} in force`} />
    </KVList>
  )
}
