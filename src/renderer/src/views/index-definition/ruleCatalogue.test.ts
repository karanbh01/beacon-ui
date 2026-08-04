import { describe, expect, it } from 'vitest'
import {
  fieldValue,
  findType,
  isKnownType,
  missingRequired,
  orderedParameters,
  parseValue,
  typesFor,
  type ParameterSpec,
  type RuleTypes
} from './ruleCatalogue'

function param(over: Partial<ParameterSpec> & { name: string }): ParameterSpec {
  return {
    label: over.name,
    type: 'string',
    required: false,
    order: 0,
    default: null,
    choices: null,
    help: null,
    ...over
  }
}

const CATALOGUE: RuleTypes = {
  selection: [
    {
      name: 'CapRule',
      label: 'Cap',
      summary: 'Caps a name and redistributes the excess.',
      parameters: [
        param({
          name: 'redistribution',
          label: 'Redistribution',
          order: 2,
          choices: ['pro_rata', 'none']
        }),
        param({ name: 'cap', label: 'Cap level', order: 1, type: 'number', required: true }),
        param({ name: 'scope', label: 'Scope', order: 0, default: 'index' })
      ]
    }
  ],
  weighting: [{ name: 'EqualWeighted', label: 'Equal weighted', summary: '', parameters: [] }]
}

describe('the catalogue', () => {
  it('lists the types for one stage, not both', () => {
    expect(typesFor(CATALOGUE, 'selection').map((t) => t.name)).toEqual(['CapRule'])
    expect(typesFor(CATALOGUE, 'weighting').map((t) => t.name)).toEqual(['EqualWeighted'])
  })

  it('finds a type from either stage', () => {
    expect(findType(CATALOGUE, 'EqualWeighted')?.label).toBe('Equal weighted')
    expect(findType(CATALOGUE, 'NoSuchRule')).toBeUndefined()
  })

  it('orders fields the way the catalogue asks, not the way they arrived', () => {
    // The frame draws Scope, Cap level, Redistribution in that order; the
    // array does not.
    expect(orderedParameters(findType(CATALOGUE, 'CapRule')).map((p) => p.label)).toEqual([
      'Scope',
      'Cap level',
      'Redistribution'
    ])
  })

  it('calls nothing unknown while the catalogue is still loading', () => {
    // Reporting a typo it has no basis for would be worse than saying
    // nothing, and a slow engine must not make every rule look wrong.
    const rule = { id: 'r1', type: 'CapRule', params: {} }
    expect(isKnownType(undefined, rule)).toBe(true)
    expect(isKnownType(CATALOGUE, { ...rule, type: 'Capp Rule' })).toBe(false)
  })
})

describe('fieldValue', () => {
  it("shows the catalogue's default rather than a blank to guess at", () => {
    expect(fieldValue(param({ name: 'scope', default: 'index' }), {})).toBe('index')
  })

  it('prefers what the rule actually carries', () => {
    expect(fieldValue(param({ name: 'scope', default: 'index' }), { scope: 'sector' })).toBe(
      'sector'
    )
  })

  it('shows an explicit null as empty, not as "null"', () => {
    expect(fieldValue(param({ name: 'cap' }), { cap: null })).toBe('')
  })
})

describe('parseValue', () => {
  it('converts to the type the catalogue declares', () => {
    expect(parseValue(param({ name: 'cap', type: 'number' }), '0.2')).toBe(0.2)
    expect(parseValue(param({ name: 'n', type: 'integer' }), '10')).toBe(10)
    expect(parseValue(param({ name: 'on', type: 'boolean' }), 'true')).toBe(true)
  })

  it('keeps a string a string, even when it looks like a number', () => {
    // The old editor JSON-parsed everything, so an identifier like "10" came
    // back as a number and py-beacon rejected it.
    expect(parseValue(param({ name: 'id', type: 'string' }), '10')).toBe('10')
  })

  it('reports an empty field as null so the caller can omit it', () => {
    expect(parseValue(param({ name: 'cap', type: 'number' }), '   ')).toBeNull()
  })

  it('falls back to JSON for a json field, and text when it does not parse', () => {
    expect(parseValue(param({ name: 'x', type: 'json' }), '[1,2]')).toEqual([1, 2])
    expect(parseValue(param({ name: 'x', type: 'json' }), 'nope')).toBe('nope')
  })
})

describe('missingRequired', () => {
  it('names a required parameter with no value, before the round trip', () => {
    // Previously this surfaced on validate, or later still as an error from
    // the engine constructing the rule.
    expect(missingRequired(findType(CATALOGUE, 'CapRule'), {})).toEqual(['Cap level'])
  })

  it('says nothing once it is supplied', () => {
    expect(missingRequired(findType(CATALOGUE, 'CapRule'), { cap: 0.2 })).toEqual([])
  })

  it('does not demand a required parameter that has a default', () => {
    const spec = {
      ...CATALOGUE.selection[0]!,
      parameters: [param({ name: 'scope', label: 'Scope', required: true, default: 'index' })]
    }
    expect(missingRequired(spec, {})).toEqual([])
  })
})
