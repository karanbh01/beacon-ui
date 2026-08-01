import { useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import type { RuleSpec } from './pipeline'
import './RuleEditor.css'

export interface RuleEditorProps {
  rule: RuleSpec
  onApply: (rule: RuleSpec) => void
  onCancel: () => void
}

interface Param {
  key: string
  value: string
}

function toParams(rule: RuleSpec): Param[] {
  return Object.entries(rule.params ?? {}).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value)
  }))
}

/**
 * Parse back to the type the user typed.
 *
 * JSON first so numbers, booleans and lists survive a round trip; a value
 * that is not JSON is kept as a string, which is what a bare word is.
 */
function parse(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

/**
 * Figma 324:1614, the accordion that opens under a selected rule.
 *
 * Figma draws named controls — Scope, Cap level, Redistribution, Breach
 * handling — because it knows what a CapRule takes. beacon-ui does not:
 * `RuleSpec.params` is a free-form object and py-beacon publishes no
 * catalogue of rule types or their arguments, unlike `/optimise/constraint-
 * types` which does exactly that for constraints. So the editor is generic —
 * type plus key/value pairs — and issue #43 asks for the catalogue that would
 * let it render real fields.
 */
export function RuleEditor({ rule, onApply, onCancel }: RuleEditorProps): ReactElement {
  const [type, setType] = useState(rule.type)
  const [params, setParams] = useState<Param[]>(toParams(rule))

  const apply = (): void => {
    const entries = params
      .filter((param) => param.key.trim() !== '')
      .map((param) => [param.key.trim(), parse(param.value)] as const)
    onApply({ id: rule.id, type: type.trim(), params: Object.fromEntries(entries) })
  }

  const update = (index: number, patch: Partial<Param>): void => {
    setParams((current) =>
      current.map((param, at) => (at === index ? { ...param, ...patch } : param))
    )
  }

  return (
    <div className="rule-editor">
      <div className="rule-editor-fields">
        <Field label="Rule type" width={200}>
          <input
            className="rule-editor-input"
            aria-label="Rule type"
            value={type}
            onChange={(event) => {
              setType(event.target.value)
            }}
          />
        </Field>

        {params.map((param, index) => (
          <div className="rule-editor-param" key={index}>
            <Field label="Parameter" width={160}>
              <input
                className="rule-editor-input"
                aria-label={`Parameter ${String(index + 1)} name`}
                value={param.key}
                onChange={(event) => {
                  update(index, { key: event.target.value })
                }}
              />
            </Field>
            <Field label="Value" width={160}>
              <input
                className="rule-editor-input"
                aria-label={`Parameter ${String(index + 1)} value`}
                value={param.value}
                onChange={(event) => {
                  update(index, { value: event.target.value })
                }}
              />
            </Field>
          </div>
        ))}
      </div>

      <div className="rule-editor-actions">
        <Button variant="accent" onClick={apply}>
          Apply
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          onClick={() => {
            setParams((current) => [...current, { key: '', value: '' }])
          }}
        >
          Add parameter
        </Button>
      </div>

      <p className="rule-editor-note type-11">
        Parameters are free-form: py-beacon does not publish which arguments a rule type accepts.
        Values are read as JSON where they parse, otherwise as text.
      </p>
    </div>
  )
}
