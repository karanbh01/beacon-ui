import {
  orderedParameters,
  type ParameterSpec,
  type TypeSpec
} from '../index-definition/ruleCatalogue'
import type { TypedSpec } from './strategyDraft'

/**
 * A spec's settings in a line, as the methodology summarises a rule:
 * "Minimum price 5 · Exit 4". What is left at the engine's default is not
 * listed, so a spec with nothing set reads "Engine defaults".
 */
export function summariseSpec(catalogue: readonly TypeSpec[], spec: TypedSpec): string {
  const type = catalogue.find((entry) => entry.name === spec.type)
  return summariseValues(orderedParameters(type), spec.params ?? {})
}

/** Values against the settings that describe them, in the catalogue's order. */
export function summariseValues(
  parameters: readonly ParameterSpec[],
  values: Readonly<Record<string, unknown>>
): string {
  const parts = parameters.flatMap((param) => {
    const value = values[param.name]
    if (value === undefined || value === null || value === '') return []
    return [`${param.label} ${shown(value)}`]
  })
  return parts.length === 0 ? 'Engine defaults' : parts.join(' · ')
}

/** The label a type goes by in its catalogue, or its name. */
export function labelOf(catalogue: readonly TypeSpec[], type: string): string {
  return catalogue.find((entry) => entry.name === type)?.label ?? type
}

function shown(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value.toLocaleString('en-US')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.map(shown).join(', ')
  return JSON.stringify(value)
}
