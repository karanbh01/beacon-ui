import type { ReactElement } from 'react'
import { ParamField } from '../../index-definition/ParamField'
import type { ParameterSpec } from '../../index-definition/ruleCatalogue'
import { FieldPicker } from './FieldPicker'
import { IdentifierListField } from './IdentifierListField'
import { KeyedNumbersField } from './KeyedNumbersField'
import { readNamed } from './paramValues'
import { ReferenceValuesField } from './ReferenceValuesField'
import { ConstraintRowsField, FactorSignalsField } from './TypedRowsField'

/** What the numbers in a table of tickers are, by the setting that holds them. */
const NUMBER_HEADS: Record<string, string> = {
  basket: 'Weight',
  budgets: 'Share of risk',
  expected_returns: 'Expected return',
  current_weights: 'Weight'
}

/**
 * A strategy setting, drawn from the shape the engine names for it
 * (BN-330): a field from the engine's fields, tickers from a search, values
 * a reference column holds, a table of a number per name, or rows of typed
 * settings. Anything else is the catalogue's plain control, as Index
 * Definition draws it.
 */
export function StrategyParamField({
  param,
  value,
  onChange,
  siblings = {}
}: {
  param: ParameterSpec
  value: string
  onChange: (next: string) => void
  /** The other settings of the same type, as typed, by name. */
  siblings?: Readonly<Record<string, string>>
}): ReactElement {
  const label = param.required ? `${param.label} *` : param.label
  const shared = { label, value, onChange }

  switch (param.ref) {
    case 'FieldNode':
      return <FieldPicker {...shared} />
    case 'IdentifierList':
      return <IdentifierListField {...shared} />
    case 'ReferenceValueList':
      return <ReferenceValuesField {...shared} column={param.column ?? ''} />
    case 'IdentifierValues':
      return (
        <KeyedNumbersField
          {...shared}
          keyLabel="Ticker"
          valueLabel={NUMBER_HEADS[param.name] ?? 'Value'}
          percent
        />
      )
    case 'FactorTargets':
      // A target is for a factor the tilt names, in its `factors` (BN-330).
      return (
        <KeyedNumbersField
          {...shared}
          keyLabel="Factor"
          valueLabel="Target"
          percent={false}
          keys={readNamed(siblings.factors ?? '').map(([name]) => name)}
        />
      )
    case 'ConstraintRows':
      return <ConstraintRowsField {...shared} family={param.options} />
    case 'FactorSignals':
      return <FactorSignalsField {...shared} family={param.options} />
    default:
      return <ParamField param={param} value={value} onChange={onChange} />
  }
}
