import type { components } from '@shared/api.generated'
import type { RuleSpec } from './pipeline'

export type TypeSpec = components['schemas']['TypeSpec']
export type ParameterSpec = components['schemas']['ParameterSpec']
export type RuleTypes = components['schemas']['RuleTypes']

/** Which stage of the pipeline a type belongs to. */
export type Stage = 'selection' | 'weighting'

export function typesFor(catalogue: RuleTypes | undefined, stage: Stage): TypeSpec[] {
  return [...(catalogue?.[stage] ?? [])]
}

export function findType(catalogue: RuleTypes | undefined, name: string): TypeSpec | undefined {
  for (const stage of ['selection', 'weighting'] as const) {
    const match = catalogue?.[stage].find((spec) => spec.name === name)
    if (match !== undefined) return match
  }
  return undefined
}

/** Fields in the order the catalogue asks for, required ones marked. */
export function orderedParameters(spec: TypeSpec | undefined): ParameterSpec[] {
  return [...(spec?.parameters ?? [])].sort((a, b) => a.order - b.order)
}

/**
 * The value to show in a field.
 *
 * A parameter the rule does not carry falls back to the catalogue's default,
 * so opening a fresh rule shows what py-beacon would use rather than a blank
 * the user has to guess at.
 */
export function fieldValue(param: ParameterSpec, params: Record<string, unknown>): string {
  const current = Object.hasOwn(params, param.name) ? params[param.name] : param.default
  if (current === null || current === undefined) return ''
  return typeof current === 'string' ? current : JSON.stringify(current)
}

/**
 * Parse a field back to the type the catalogue says it is.
 *
 * `type` here is a DISPLAY type — what control to render — so this converts
 * to the shape py-beacon expects rather than guessing from the text. `json`
 * and anything unrecognised fall back to the old behaviour: JSON where it
 * parses, text otherwise, which is what a bare word is.
 */
export function parseValue(param: ParameterSpec, raw: string): unknown {
  const text = raw.trim()
  if (text === '') return null

  if (param.type === 'number' || param.type === 'integer') {
    const value = Number(text)
    return Number.isFinite(value) ? value : text
  }
  if (param.type === 'boolean') return text === 'true'
  if (param.type === 'string') return text

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Required parameters the rule has no value for.
 *
 * Reported before the round trip. Previously a missing argument surfaced only
 * when validate ran, or later still as an error from the engine constructing
 * the rule.
 */
export function missingRequired(
  spec: TypeSpec | undefined,
  params: Record<string, unknown>
): string[] {
  return orderedParameters(spec)
    .filter(
      (param) => param.required && param.default === null && !Object.hasOwn(params, param.name)
    )
    .map((param) => param.label)
}

/** Whether a type is one the engine actually offers. */
export function isKnownType(catalogue: RuleTypes | undefined, rule: RuleSpec): boolean {
  // With no catalogue loaded nothing can be called unknown — the editor must
  // not report a typo it has no basis for.
  if (catalogue === undefined) return true
  return findType(catalogue, rule.type) !== undefined
}
