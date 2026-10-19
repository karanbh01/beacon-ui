import type { ReactElement } from 'react'
import { Field } from '../../components/Field/Field'
import { FormattedInput } from '../../components/FormattedInput/FormattedInput'
import { Select } from '../../components/Select/Select'
import { ExpressionEditor } from './ExpressionEditor'
import type { ExpressionNode } from './expression'
import type { ParameterSpec } from './ruleCatalogue'
import './ParamField.css'

/**
 * The stored tree out of the editor's string state.
 *
 * `RuleEditor` holds every parameter as text so one code path serves them
 * all; a structured one is that text parsed. Unparseable means the rule
 * carries something this cannot read, and `ExpressionEditor` says so rather
 * than starting from blank — which would discard it on the next Apply.
 */
function parseExpression(value: string): ExpressionNode | undefined {
  if (value.trim() === '') return undefined
  try {
    return JSON.parse(value) as ExpressionNode
  } catch {
    return undefined
  }
}

/** A control matched to the catalogue's display type, not guessed from the value. */
export function ParamField({
  param,
  value,
  onChange,
  universeId = ''
}: {
  param: ParameterSpec
  value: string
  onChange: (next: string) => void
  /** A screen's universe, for the expression editor's reference values. */
  universeId?: string
}): ReactElement {
  const label = labelFor(param)

  /*
   * A structured parameter renders from the schema it names (BN-188).
   *
   * `ref` is the catalogue saying "this value must conform to that
   * component", which is what keeps the rule list self-describing: the
   * alternative was keying on the parameter being CALLED `expression`, and
   * then the catalogue stops describing itself at exactly the rule that
   * needs it most. Any future structured parameter arrives working.
   */
  if (param.ref === 'ExpressionNode') {
    return (
      <div className="param-field-structured">
        <span className="field-label">{label}</span>
        <ExpressionEditor
          value={parseExpression(value)}
          onChange={(next) => {
            onChange(next === undefined ? '' : JSON.stringify(next))
          }}
          universeId={universeId}
        />
      </div>
    )
  }

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

  // Money with its commas, a fraction as a percent (Karan, 2026-10-18).
  if (param.unit === 'money' || param.unit === 'fraction') {
    return (
      <Field label={label} width={180}>
        <FormattedInput
          className="param-field-input"
          label={param.label}
          value={value}
          format={param.unit === 'money' ? 'money' : 'percent'}
          onChange={onChange}
        />
      </Field>
    )
  }

  return (
    <Field label={label} width={180}>
      <input
        className="param-field-input"
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
 * The catalogue's label, starred when required and with its unit where the
 * number alone would be ambiguous: 5 is a cost in bps or a count of days,
 * and only the catalogue knows which. A fraction is typed as a percent, so
 * it says %. Money and counts read without one, and a label that already
 * names its unit ("Days before a price is stale") is not told it twice.
 */
function labelFor(param: ParameterSpec): string {
  const unit = param.unit === 'fraction' ? '%' : (param.unit ?? undefined)
  const said =
    unit === undefined ||
    param.unit === 'money' ||
    param.unit === 'count' ||
    param.label.toLowerCase().includes(unit.toLowerCase())
  const named = said ? param.label : `${param.label} (${unit})`
  return param.required ? `${named} *` : named
}
