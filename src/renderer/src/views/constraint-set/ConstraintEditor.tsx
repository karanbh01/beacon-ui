import { useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { Select } from '../../components/Select/Select'
import type { ConstraintRow, ConstraintTypes } from '../shared/optimiseQueries'
import './ConstraintEditor.css'

export interface ConstraintEditorProps {
  constraint: ConstraintRow
  /** Constraint class → the parameter names it accepts. */
  catalogue: ConstraintTypes['types']
  onApply: (constraint: ConstraintRow) => void
  onCancel: () => void
}

function initial(constraint: ConstraintRow, parameters: readonly string[]): Record<string, string> {
  const params = constraint.params ?? {}
  return Object.fromEntries(
    parameters.map((name) => {
      const value = params[name]
      if (value === undefined || value === null) return [name, '']
      return [name, typeof value === 'string' ? value : JSON.stringify(value)]
    })
  )
}

function parse(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === '') return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

/**
 * The inline editor for one constraint (Figma 340:1240).
 *
 * The contrast with the index rule editor is the whole point.
 * `/optimise/constraint-types` publishes each class and the parameters it
 * takes, so this renders a NAMED FIELD PER PARAMETER — no free-text keys, no
 * guessing, and changing the type re-renders the right fields. That is what
 * #43 asks for on the index side.
 */
export function ConstraintEditor({
  constraint,
  catalogue,
  onApply,
  onCancel
}: ConstraintEditorProps): ReactElement {
  const [type, setType] = useState(constraint.type)
  const parameters = catalogue[type] ?? []
  const [values, setValues] = useState<Record<string, string>>(() =>
    initial(constraint, catalogue[constraint.type] ?? [])
  )

  const changeType = (next: string): void => {
    setType(next)
    // A different class takes different arguments; carrying the old ones over
    // would submit parameters the constructor does not accept.
    setValues(initial({ ...constraint, params: {} }, catalogue[next] ?? []))
  }

  const apply = (): void => {
    const params = Object.fromEntries(
      parameters
        .map((name) => [name, parse(values[name] ?? '')] as const)
        .filter(([, value]) => value !== null)
    )
    onApply({ id: constraint.id, type, params })
  }

  return (
    <div className="constraint-editor">
      <div className="constraint-editor-fields">
        <Field label="Constraint type" width={200}>
          <Select
            className="constraint-inline-select"
            options={Object.keys(catalogue).map((name) => ({ value: name, label: name }))}
            value={type}
            onChange={changeType}
            label="Constraint type"
            placeholder={type}
          />
        </Field>

        {parameters.map((name) => (
          <Field key={name} label={name.replace(/_/g, ' ')} width={140}>
            <input
              className="constraint-editor-input"
              aria-label={name}
              value={values[name] ?? ''}
              onChange={(event) => {
                setValues((current) => ({ ...current, [name]: event.target.value }))
              }}
            />
          </Field>
        ))}

        {parameters.length === 0 && (
          <span className="constraint-editor-note type-11">
            This constraint takes no parameters.
          </span>
        )}
      </div>

      <div className="constraint-editor-actions">
        <Button variant="accent" onClick={apply}>
          Apply
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}
