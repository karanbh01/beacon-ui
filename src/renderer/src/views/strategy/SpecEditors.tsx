import { useState, type ReactElement, type ReactNode } from 'react'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { Select } from '../../components/Select/Select'
import { ParamField } from '../index-definition/ParamField'
import {
  fieldValue,
  orderedParameters,
  parseValue,
  type ParameterSpec,
  type TypeSpec
} from '../index-definition/ruleCatalogue'
import type { TypedSpec } from './strategyDraft'
import '../index-definition/RuleEditor.css'

/**
 * One typed spec, a screen, a cap, a constraint, a signal, an optimiser or a
 * replication, edited as Index Definition edits a rule: its type from the
 * engine's catalogue, then each setting as the control the catalogue asks
 * for, applied together or not at all.
 */
export function TypedEditor({
  label,
  catalogue,
  spec,
  onApply,
  onCancel
}: {
  label: string
  catalogue: readonly TypeSpec[]
  spec: TypedSpec | null | undefined
  onApply: (next: TypedSpec) => void
  onCancel: () => void
}): ReactElement {
  const [type, setType] = useState(spec?.type ?? '')
  // What has been typed, by setting; a new type starts from its own defaults.
  const [edited, setEdited] = useState<Record<string, string>>({})
  const chosen = catalogue.find((entry) => entry.name === type)
  const parameters = orderedParameters(chosen)
  const saved = type === spec?.type ? (spec.params ?? {}) : {}
  const current = (param: ParameterSpec): string => edited[param.name] ?? fieldValue(param, saved)

  const applied = (): Record<string, unknown> => {
    const params: Record<string, unknown> = {}
    for (const param of parameters) {
      const parsed = parseValue(param, current(param))
      // Left empty is left to the engine's default rather than sent as null.
      if (parsed !== null) params[param.name] = parsed
    }
    return params
  }

  return (
    <div className="rule-editor">
      <div className="rule-editor-fields">
        <Field label={label} width={220}>
          <Select
            label={label}
            options={catalogue.map((entry) => ({ value: entry.name, label: entry.label }))}
            value={type}
            placeholder="Choose…"
            onChange={(next) => {
              setType(next)
              setEdited({})
            }}
          />
        </Field>
        {parameters.map((param) => (
          <ParamField
            key={`${type}.${param.name}`}
            param={param}
            value={current(param)}
            onChange={(next) => {
              setEdited((all) => ({ ...all, [param.name]: next }))
            }}
          />
        ))}
      </div>
      <div className="rule-editor-actions">
        <Button
          variant="accent"
          disabled={type === ''}
          onClick={() => {
            onApply({ type, params: applied() })
          }}
        >
          Apply
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
      {chosen !== undefined && chosen.summary !== '' && (
        <p className="rule-editor-note type-11">{chosen.summary}</p>
      )}
    </div>
  )
}

/**
 * A group of settings with no type of its own, such as the execution limits:
 * its fields, which apply as they are typed, and Done to fold it away.
 */
export function SettingsEditor({
  children,
  onDone
}: {
  children: ReactNode
  onDone: () => void
}): ReactElement {
  return (
    <div className="rule-editor">
      <div className="rule-editor-fields">{children}</div>
      <div className="rule-editor-actions">
        <Button variant="accent" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  )
}
