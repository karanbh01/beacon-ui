import { useState, type ReactElement } from 'react'
import { Field } from '../../../components/Field/Field'
import type { TypeSpec } from '../../index-definition/ruleCatalogue'
import { TypedEditor } from '../SpecEditors'
import { addTo, listRows } from '../specRowBuilders'
import { SpecRowList, type SpecRow } from '../SpecRows'
import { labelOf, summariseSpec } from '../specSummary'
import { useFamily } from './paramFamilies'
import { readNamed, readRows, written, type TypedSpec } from './paramValues'
import './params.css'

/**
 * An optimised replication's constraints (BN-330), as the rows an active
 * strategy's constraints are (Karan, 2026-10-19): each a type from the
 * family the engine names, opening its settings under itself.
 */
export function ConstraintRowsField({
  label,
  family,
  value,
  onChange
}: {
  label: string
  family: string | null | undefined
  value: string
  onChange: (next: string) => void
}): ReactElement {
  const catalogue = useFamily(family)
  const specs: TypedSpec[] = readRows(value).map(({ type, params }) => ({
    type,
    params: params ?? {}
  }))
  // The engine takes a row's id and ignores it; it is the editor's to keep.
  const save = (next: TypedSpec[]): void => {
    onChange(written(next.map((spec, at) => ({ id: `constraint-${String(at + 1)}`, ...spec }))))
  }

  return (
    <div className="param-field-structured">
      <span className="field-label">{label}</span>
      <div className="param-rows">
        <SpecRowList
          groups={[
            {
              key: 'rows',
              label: '',
              rows: listRows('constraint', 'Constraint', catalogue, specs, save),
              add: addTo('Add constraint', 'constraint', catalogue, specs, save)
            }
          ]}
        />
      </div>
    </div>
  )
}

/**
 * A factor tilt's factors (BN-330): each a name of the user's own and the
 * signal whose scores are the names' exposures to it.
 */
export function FactorSignalsField({
  label,
  family,
  value,
  onChange
}: {
  label: string
  family: string | null | undefined
  value: string
  onChange: (next: string) => void
}): ReactElement {
  const catalogue = useFamily(family)
  const factors = readNamed(value)
  const save = (next: readonly [string, TypedSpec][]): void => {
    onChange(written(Object.fromEntries(next)))
  }
  const first = catalogue[0]

  const rows: SpecRow[] = factors.map(([name, spec], at) => ({
    id: `factor-${String(at)}`,
    badge: name,
    summary: `${labelOf(catalogue, spec.type)} · ${summariseSpec(catalogue, spec)}`,
    editor: (close) => (
      <FactorEditor
        name={name}
        spec={spec}
        catalogue={catalogue}
        taken={factors.map(([other]) => other).filter((other) => other !== name)}
        onApply={(nextName, nextSpec) => {
          save(factors.map((entry, index) => (index === at ? [nextName, nextSpec] : entry)))
          close()
        }}
        onCancel={close}
      />
    ),
    onRemove: () => {
      save(factors.filter((_, index) => index !== at))
    }
  }))

  return (
    <div className="param-field-structured">
      <span className="field-label">{label}</span>
      <div className="param-rows">
        <SpecRowList
          groups={[
            {
              key: 'factors',
              label: '',
              rows,
              add: {
                label: 'Add factor',
                ...(first === undefined ? { blocked: 'This engine lists no signals.' } : {}),
                onAdd: () => {
                  if (first === undefined) return undefined
                  save([...factors, [freeName(factors), { type: first.name, params: {} }]])
                  return `factor-${String(factors.length)}`
                }
              }
            }
          ]}
        />
      </div>
    </div>
  )
}

function FactorEditor({
  name,
  spec,
  catalogue,
  taken,
  onApply,
  onCancel
}: {
  name: string
  spec: TypedSpec
  catalogue: readonly TypeSpec[]
  taken: readonly string[]
  onApply: (name: string, spec: TypedSpec) => void
  onCancel: () => void
}): ReactElement {
  const [named, setNamed] = useState(name)
  const clash = taken.includes(named.trim())

  return (
    <TypedEditor
      label="Signal"
      catalogue={catalogue}
      spec={spec}
      onApply={(next) => {
        // A name another factor has would overwrite it, so it keeps its own.
        onApply(named.trim() === '' || clash ? name : named.trim(), next)
      }}
      onCancel={onCancel}
    >
      <Field label={clash ? 'Name (taken)' : 'Name'} width={160}>
        <input
          className="param-field-input"
          aria-label="Factor name"
          value={named}
          onChange={(event) => {
            setNamed(event.target.value)
          }}
        />
      </Field>
    </TypedEditor>
  )
}

/** The first of factor_1, factor_2, … that is not already a factor's name. */
function freeName(factors: readonly [string, TypedSpec][]): string {
  const names = new Set(factors.map(([name]) => name))
  let count = factors.length + 1
  while (names.has(`factor_${String(count)}`)) count += 1
  return `factor_${String(count)}`
}
