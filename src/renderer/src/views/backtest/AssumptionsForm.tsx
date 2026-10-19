import type { ReactElement } from 'react'
import { ParamField } from '../index-definition/ParamField'
import { fieldValue, type ParameterSpec } from '../index-definition/ruleCatalogue'
import type { SectionProps } from './fields'

/**
 * What the run takes as given, grouped by what each is about (Karan,
 * 2026-10-18): eight fields in one wrapping row read as a pile.
 *
 * The engine lists its assumptions flat, so the groups are this app's, by
 * name. One it adds later and this does not know lands under Other rather
 * than disappearing.
 */
const GROUPS: readonly { title: string; note: string; names: readonly string[] }[] = [
  {
    title: 'Missing data',
    note: 'If a price, free float or trading volume is missing for a day, the last known value is used for up to this many days. The FX setting decides which exchange rate to use when there is none for that day.',
    names: [
      'max_price_staleness_days',
      'free_float_backfill_days',
      'volume_backfill_days',
      'fx_policy'
    ]
  },
  {
    title: 'Cash and income',
    note: 'The interest rate paid on uninvested cash, and the tax taken off each dividend.',
    names: ['cash_rate', 'withholding_tax_rate']
  },
  {
    title: 'Risk and performance',
    note: 'The interest rate used to work out the Sharpe ratio, and the number of trading days in a year.',
    names: ['risk_free_rate', 'periods_per_year']
  }
]

/** The engine's labels where they read badly in this form (Karan, 2026-10-18). */
const LABELS: Record<string, string> = {
  cash_rate: 'Interest on cash',
  withholding_tax_rate: 'Dividend withholding tax'
}

export function AssumptionsForm({ setup, onChange, options }: SectionProps): ReactElement {
  const params = options?.modelling_assumptions ?? []
  const known = new Set(GROUPS.flatMap((group) => group.names))
  const others = params.filter((param) => !known.has(param.name))

  const field = (param: ParameterSpec): ReactElement => (
    <ParamField
      key={param.name}
      param={{ ...param, label: LABELS[param.name] ?? param.label }}
      value={setup.assumptions[param.name] ?? fieldValue(param, {})}
      onChange={(next) => {
        onChange((current) => ({
          ...current,
          assumptions: { ...current.assumptions, [param.name]: next }
        }))
      }}
    />
  )

  return (
    <div className="backtest-assumptions">
      {GROUPS.map((group) => {
        const members = group.names.flatMap((name) => params.filter((param) => param.name === name))
        if (members.length === 0) return null
        return (
          <section key={group.title} className="backtest-assumption-group">
            <h4 className="section-title">{group.title}</h4>
            <p className="backtest-note type-11">{group.note}</p>
            <div className="backtest-form-row">{members.map(field)}</div>
          </section>
        )
      })}
      {others.length > 0 && (
        <section className="backtest-assumption-group">
          <h4 className="section-title">Other</h4>
          <div className="backtest-form-row">{others.map(field)}</div>
        </section>
      )}
    </div>
  )
}
