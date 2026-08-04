import { useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { Select } from '../../components/Select/Select'
import { useRuleTypes } from '../shared/strategyQueries'
import type { RuleSpec } from './pipeline'
import {
  fieldValue,
  findType,
  missingRequired,
  orderedParameters,
  parseValue,
  typesFor,
  type ParameterSpec
} from './ruleCatalogue'
import './RuleEditor.css'

export interface RuleEditorProps {
  rule: RuleSpec
  /** Which stage the rule belongs to, so the type list is the right one. */
  stage?: 'selection' | 'weighting'
  onApply: (rule: RuleSpec) => void
  onCancel: () => void
}

/** A control matched to the catalogue's display type, not guessed from the value. */
function ParamField({
  param,
  value,
  onChange
}: {
  param: ParameterSpec
  value: string
  onChange: (next: string) => void
}): ReactElement {
  const label = param.required ? `${param.label} *` : param.label

  if (param.choices !== null && param.choices !== undefined && param.choices.length > 0) {
    return (
      <Field label={label} width={180}>
        <Select
          label={param.label}
          options={param.choices.map((choice) => ({ value: choice, label: choice }))}
          value={value}
          onChange={onChange}
          placeholder="—"
        />
      </Field>
    )
  }

  if (param.type === 'boolean') {
    return (
      <Field label={label} width={180}>
        <Select
          label={param.label}
          options={[
            { value: 'true', label: 'true' },
            { value: 'false', label: 'false' }
          ]}
          value={value === '' ? 'false' : value}
          onChange={onChange}
        />
      </Field>
    )
  }

  return (
    <Field label={label} width={180}>
      <input
        className="rule-editor-input"
        aria-label={param.label}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
    </Field>
  )
}

/**
 * Figma 324:1614, the accordion that opens under a selected rule.
 *
 * The frame draws named controls — Scope, Cap level, Redistribution, Breach
 * handling — because the designer knew what a CapRule takes. This used to be
 * a free-text type plus untyped key/value pairs, because `RuleSpec.params` is
 * an open object and nothing published which arguments a rule accepts.
 *
 * `/indices/rule-types` (BN-117) publishes exactly that, so the type is a
 * closed list and every parameter renders as the control its display type
 * asks for, labelled and ordered by the catalogue. A misspelled type is
 * unselectable rather than discovered on validate, and a missing required
 * argument is reported before the round trip.
 *
 * With no catalogue — an older engine, or one still starting — it degrades to
 * the free-form editor rather than blocking the pane.
 */
export function RuleEditor({
  rule,
  stage = 'selection',
  onApply,
  onCancel
}: RuleEditorProps): ReactElement {
  const catalogue = useRuleTypes()
  const [type, setType] = useState(rule.type)
  const [edited, setEdited] = useState<Record<string, string>>({})

  const spec = findType(catalogue.data, type)
  const parameters = orderedParameters(spec)
  const options = typesFor(catalogue.data, stage).map((entry) => ({
    value: entry.name,
    label: entry.label
  }))

  const current = (param: ParameterSpec): string =>
    edited[param.name] ?? fieldValue(param, rule.params ?? {})

  const applied = (): Record<string, unknown> => {
    const params: Record<string, unknown> = {}
    for (const param of parameters) {
      const parsed = parseValue(param, current(param))
      // Null means the field was left empty. Omitting it lets py-beacon apply
      // its own default rather than being told the value is None.
      if (parsed !== null) params[param.name] = parsed
    }
    return params
  }

  const missing = missingRequired(spec, applied())

  return (
    <div className="rule-editor">
      <div className="rule-editor-fields">
        <Field label="Rule type" width={220}>
          {options.length > 0 ? (
            <Select label="Rule type" options={options} value={type} onChange={setType} />
          ) : (
            <input
              className="rule-editor-input"
              aria-label="Rule type"
              value={type}
              onChange={(event) => {
                setType(event.target.value)
              }}
            />
          )}
        </Field>

        {parameters.map((param) => (
          <ParamField
            key={param.name}
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
          onClick={() => {
            onApply({ id: rule.id, type, params: applied() })
          }}
          disabled={missing.length > 0}
        >
          Apply
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>

      {spec !== undefined && spec.summary !== '' && (
        <p className="rule-editor-note type-11">{spec.summary}</p>
      )}

      {missing.length > 0 && (
        <p className="rule-editor-note type-11">
          Needs {missing.join(', ')} before this rule can be applied.
        </p>
      )}

      {options.length === 0 && (
        <p className="rule-editor-note type-11">
          This engine publishes no rule catalogue, so the type is free text and parameters cannot be
          labelled. Values are read as JSON where they parse, otherwise as text.
        </p>
      )}
    </div>
  )
}
