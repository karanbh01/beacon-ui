import type { components } from '@shared/api.generated'
import type { ParameterSpec } from '../../index-definition/ruleCatalogue'

export type FieldNode = components['schemas']['FieldNode']
export type ConstraintRow = components['schemas']['ConstraintRow']
export type TypedSpec = components['schemas']['TypedSpec']

/*
 * The shapes a structured setting takes (py-beacon BN-330), read out of the
 * text the editors hold and written back to it. The rule editors keep every
 * setting as text so one path serves them all; a structured one is its JSON.
 * Text that does not parse, or parses to another shape, reads as empty: the
 * editor then starts clean rather than showing something it cannot edit.
 */

function parsed(text: string): unknown {
  if (text.trim() === '') return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readList(text: string): string[] {
  const value = parsed(text)
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : []
}

/** A number for each key, in the order they were written. */
export function readNumbers(text: string): [string, number][] {
  const value = parsed(text)
  if (!isRecord(value)) return []
  return Object.entries(value).flatMap(([key, entry]) =>
    typeof entry === 'number' ? [[key, entry] as [string, number]] : []
  )
}

export function readField(text: string): FieldNode | undefined {
  const value = parsed(text)
  if (!isRecord(value) || typeof value.namespace !== 'string' || typeof value.name !== 'string')
    return undefined
  return {
    node: 'field',
    namespace: value.namespace,
    name: value.name,
    ...(typeof value.dataset === 'string' ? { dataset: value.dataset } : {})
  }
}

function readSpec(value: unknown): TypedSpec | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') return undefined
  return { type: value.type, params: isRecord(value.params) ? value.params : {} }
}

export function readRows(text: string): ConstraintRow[] {
  const value = parsed(text)
  if (!Array.isArray(value)) return []
  return value.flatMap((entry, position) => {
    const spec = readSpec(entry)
    if (spec === undefined) return []
    const id =
      isRecord(entry) && typeof entry.id === 'string' ? entry.id : `row-${String(position)}`
    return [{ id, ...spec }]
  })
}

/** Each factor by its name, as a signal. */
export function readNamed(text: string): [string, TypedSpec][] {
  const value = parsed(text)
  if (!isRecord(value)) return []
  return Object.entries(value).flatMap(([name, entry]) => {
    const spec = readSpec(entry)
    return spec === undefined ? [] : [[name, spec] as [string, TypedSpec]]
  })
}

/** Empty is left to the engine's default, which is how a cleared field is sent. */
export function written(value: unknown[] | Record<string, unknown> | undefined): string {
  if (value === undefined) return ''
  const empty = Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0
  return empty ? '' : JSON.stringify(value)
}

/** A label without the star a required setting shows, for a control's name. */
export function plainLabel(label: string): string {
  return label.replace(/ \*$/, '')
}

/**
 * What a structured setting holds, as its part of a row's summary:
 * "Sectors Financials, Health Care", "Factors value, momentum", "2
 * constraints". Undefined for a setting that is not structured, or empty.
 */
export function describeStructured(param: ParameterSpec, value: unknown): string | undefined {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const said = describe(param, text)
  if (said === undefined || said === '') return undefined
  // A count says what it counts; anything else follows its label.
  return param.ref === 'ConstraintRows' ? said : `${param.label} ${said}`
}

function describe(param: ParameterSpec, text: string): string | undefined {
  switch (param.ref) {
    case 'FieldNode':
      return readField(text)?.name.replace(/_/g, ' ')
    case 'IdentifierList':
    case 'ReferenceValueList':
      return listed(readList(text))
    case 'IdentifierValues':
      return counted(readNumbers(text).length, 'name')
    case 'FactorTargets':
      return readNumbers(text)
        .map(([factor, target]) => `${factor} ${String(target)}`)
        .join(', ')
    case 'ConstraintRows':
      return counted(readRows(text).length, 'constraint')
    case 'FactorSignals':
      return listed(readNamed(text).map(([name]) => name))
    default:
      // A shape with no words of its own here, such as an expression.
      return 'set'
  }
}

function listed(values: readonly string[]): string {
  if (values.length <= 3) return values.join(', ')
  return `${values.slice(0, 3).join(', ')} and ${String(values.length - 3)} more`
}

/** Nothing for none: an empty setting is left out of the summary. */
function counted(count: number, noun: string): string {
  if (count === 0) return ''
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`
}
