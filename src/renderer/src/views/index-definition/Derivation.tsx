import type { ReactElement } from 'react'
import { Card } from '../../components/Card/Card'
import { KV, KVList } from '../../components/KV/KV'
import { ConstraintList } from '../constraint-set/ConstraintList'
import type { ConstraintTypes } from '../shared/optimiseQueries'
import type { DerivationPayload } from './pipeline'
import './Derivation.css'

export interface DerivationProps {
  derivation: DerivationPayload
  /** Constraint class → the parameter names it accepts. */
  types: ConstraintTypes['types']
  onChange: (derivation: DerivationPayload) => void
  /** Open the index this one was solved against. */
  onOpenParent: (indexId: string) => void
}

/**
 * What an optimised index is made of, in place of a methodology (BU-170).
 *
 * A derived document is a REFERENCE, not a copy: it carries the parent's id,
 * the objective and the constraints, and never the parent's own pipeline. So
 * there is no inherited methodology to edit into inconsistency — the editable
 * surface IS the derivation, and this is it.
 *
 * The parent is not editable. Pointing a derivation at a different index is a
 * new index rather than an edit to this one, which is py-beacon's rule and a
 * sound one: the solved weights this document names came from that parent.
 */
export function Derivation({
  derivation,
  types,
  onChange,
  onOpenParent
}: DerivationProps): ReactElement {
  return (
    <div className="derivation">
      <Card title="Derived from" className="derivation-card">
        <KVList>
          <KV
            label="Parent index"
            value={
              <button
                type="button"
                className="index-link type-11"
                onClick={() => {
                  onOpenParent(derivation.source_index_id)
                }}
              >
                {derivation.source_index_id} →
              </button>
            }
          />
          {/*
            A label, not a control. py-beacon accepts one objective today and
            publishes the accepted set in the field's own description, so this
            becomes a Select the day that list has two entries — and a
            free-text box would only collect values the engine rejects.
          */}
          <KV label="Objective" value={derivation.objective} />
          <KV
            label="Constraints"
            value={`${String((derivation.constraints ?? []).length)} in force`}
          />
        </KVList>
      </Card>

      <ConstraintList
        title="Constraints"
        rows={derivation.constraints ?? []}
        types={types}
        onChange={(rows) => {
          onChange({ ...derivation, constraints: [...rows] })
        }}
      />
    </div>
  )
}
