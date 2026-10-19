import type { ReactElement } from 'react'
import { Field } from '../../components/Field/Field'
import { Section } from '../../components/Section/Section'
import { Select } from '../../components/Select/Select'
import { ParamField } from '../index-definition/ParamField'
import type { SectionProps } from './fields'
import { ShareClasses } from './ShareClasses'
import { vehicleFields, vehicleValue } from './setup'

/**
 * The fund the strategy is run as: a preset (a UK OEIC, a UCITS ETF…), the
 * few of its settings this run changes, and its share classes.
 *
 * The preset stands alone on its row and its settings sit on the next, with
 * room between them — one row of everything read as a crowd (Karan,
 * 2026-10-17). No preset is a plain backtest: no fee, no pricing, no limits.
 */
export function VehicleSection({ setup, onChange, options }: SectionProps): ReactElement {
  const preset = options?.presets.find((entry) => entry.key === setup.preset)
  const fields = vehicleFields(options, preset)

  return (
    <Section title="Vehicle" className="backtest-section">
      <div className="backtest-form-row">
        <Field label="Preset" width={220}>
          <Select
            label="Preset"
            options={[
              { value: '', label: 'None (no fund costs)' },
              ...(options?.presets ?? []).map((entry) => ({ value: entry.key, label: entry.name }))
            ]}
            value={setup.preset}
            onChange={(next) => {
              // A change typed against one preset means nothing against another.
              onChange((current) => ({ ...current, preset: next, vehicle: {} }))
            }}
          />
        </Field>
        {preset !== undefined && (
          <p className="backtest-note backtest-preset-note type-11">
            {describePreset(preset.settings)}
          </p>
        )}
      </div>

      {fields.length > 0 && (
        <div className="backtest-form-row backtest-vehicle-fields">
          {fields.map((param) => (
            <ParamField
              key={param.name}
              param={param}
              value={vehicleValue(setup, preset, param.name)}
              onChange={(next) => {
                onChange((current) => ({
                  ...current,
                  vehicle: { ...current.vehicle, [param.name]: next }
                }))
              }}
            />
          ))}
        </div>
      )}

      <ShareClasses setup={setup} onChange={onChange} options={options} />
    </Section>
  )
}

/** The preset's pricing and limits, which the form leaves to it. */
function describePreset(settings: Record<string, unknown>): string {
  const pricing = typeName(settings.pricing)
  const limits = Array.isArray(settings.limits)
    ? settings.limits.map(typeName).filter((name) => name !== '')
    : []
  const pricedBy = pricing === '' ? 'its own pricing' : spoken(pricing)
  const limited =
    limits.length === 0 ? 'no holding limits' : `${limits.map(spoken).join(' and ')} holding limits`
  return `Uses ${pricedBy} and ${limited}.`
}

/* The engine's class names, as a person says them. */
const SPOKEN: Record<string, string> = {
  SinglePricing: 'single pricing',
  DualPricing: 'dual pricing',
  SwingPricing: 'swing pricing',
  DilutionLevy: 'a dilution levy',
  UcitsLimits: 'UCITS',
  Act1940Limits: '1940 Act'
}

/** "SwingPricing" → "swing pricing"; one this does not know is split at its capitals. */
function spoken(name: string): string {
  return SPOKEN[name] ?? name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}

function typeName(spec: unknown): string {
  if (typeof spec !== 'object' || spec === null || !('type' in spec)) return ''
  return typeof spec.type === 'string' ? spec.type : ''
}
