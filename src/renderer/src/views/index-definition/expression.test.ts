import { describe as group, expect, it } from 'vitest'
import {
  blankClause,
  coerceValue,
  describe,
  fieldFrom,
  pathOf,
  readScreen,
  writeScreen,
  type ExpressionNode,
  type Screen
} from './expression'

const SECTOR: ExpressionNode = {
  node: 'comparison',
  field: { node: 'field', namespace: 'reference', name: 'sector' },
  comparison: 'in',
  value: ['Information Technology', 'Financials']
}

const NOT_JAPAN: ExpressionNode = {
  node: 'not',
  operand: {
    node: 'comparison',
    field: { node: 'field', namespace: 'reference', name: 'country_domicile' },
    comparison: 'eq',
    value: 'JP'
  }
}

group('paths (BU-182)', () => {
  it('spells a field the way /data/fields publishes it', () => {
    expect(pathOf({ node: 'field', namespace: 'reference', name: 'sector' })).toBe(
      'reference.sector'
    )
  })

  it('keeps a dataset in the middle, where a feature carries one', () => {
    const field = {
      node: 'field' as const,
      namespace: 'features',
      dataset: 'fundamentals',
      name: 'pe'
    }
    expect(pathOf(field)).toBe('features.fundamentals.pe')
    expect(fieldFrom('features.fundamentals.pe')).toEqual(field)
  })

  it('round-trips a two-part path without inventing a dataset', () => {
    // `dataset` absent, not null: the engine omits it, and writing null
    // would break byte-identity with a filter saved from Python (BN-188).
    expect(fieldFrom('reference.sector')).toEqual({
      node: 'field',
      namespace: 'reference',
      name: 'sector'
    })
  })
})

group('reading a stored screen (BU-182)', () => {
  it('reads one comparison as one row', () => {
    const screen = readScreen(SECTOR)
    expect(screen?.clauses).toHaveLength(1)
    expect(screen?.clauses[0]?.path).toBe('reference.sector')
    expect(screen?.clauses[0]?.negated).toBe(false)
  })

  it('reads a negated comparison as a row that says "is not"', () => {
    expect(readScreen(NOT_JAPAN)?.clauses[0]?.negated).toBe(true)
    expect(readScreen(NOT_JAPAN)?.clauses[0]?.comparison).toBe('eq')
  })

  it('reads a group as its rows, keeping the combinator', () => {
    const both: ExpressionNode = { node: 'any', operands: [SECTOR, NOT_JAPAN] }
    const screen = readScreen(both)

    expect(screen?.combinator).toBe('any')
    expect(screen?.clauses).toHaveLength(2)
  })

  it('treats nothing as an empty screen rather than an unreadable one', () => {
    expect(readScreen(undefined)).toEqual({ combinator: 'all', clauses: [] })
  })

  it('refuses a tree it cannot draw, rather than approximating it', () => {
    /*
     * The important one. Flattening a nested group into the nearest thing
     * the editor can show would change what the index selects, silently,
     * just because somebody opened the rule and closed it again.
     */
    const nested: ExpressionNode = {
      node: 'all',
      operands: [SECTOR, { node: 'any', operands: [NOT_JAPAN, SECTOR] }]
    }
    expect(readScreen(nested)).toBeUndefined()
  })

  it('refuses a bare field, which is a node but not a row', () => {
    expect(readScreen({ node: 'field', namespace: 'reference', name: 'sector' })).toBeUndefined()
  })

  it('refuses a negated GROUP, which is not a negated clause', () => {
    const node: ExpressionNode = {
      node: 'not',
      operand: { node: 'all', operands: [SECTOR] }
    }
    expect(readScreen(node)).toBeUndefined()
  })
})

/** Narrows, and fails loudly rather than asserting the type away. */
function rowsOf(node: ExpressionNode): Screen {
  const screen = readScreen(node)
  if (screen === undefined) throw new Error('expected a row-shaped screen')
  return screen
}

group('writing a screen (BU-182)', () => {
  it('writes a single clause bare, not wrapped in a group of one', () => {
    // The same screen, and what somebody writing Python would produce.
    const screen = rowsOf(SECTOR)
    expect(writeScreen(screen)).toEqual(SECTOR)
  })

  it('round-trips a group unchanged', () => {
    const both: ExpressionNode = { node: 'any', operands: [SECTOR, NOT_JAPAN] }
    expect(writeScreen(rowsOf(both))).toEqual(both)
  })

  it('writes nothing at all when there are no clauses', () => {
    // Not an empty `all`, which would select everything and mean something.
    expect(writeScreen({ combinator: 'all', clauses: [] })).toBeUndefined()
  })
})

group('describing a screen (BU-182)', () => {
  it('says what a screen does in words', () => {
    expect(describe(SECTOR)).toBe('reference.sector is one of Information Technology, Financials')
  })

  it('describes a tree the editor cannot open', () => {
    // A rule nobody can edit should still say what it selects.
    const nested: ExpressionNode = {
      node: 'all',
      operands: [SECTOR, { node: 'any', operands: [NOT_JAPAN, SECTOR] }]
    }
    expect(describe(nested)).toContain('and')
    expect(describe(nested)).toContain('or')
  })

  it('has something to say about nothing', () => {
    expect(describe(undefined)).toBe('no screen')
  })
})

group('changing comparison (BU-182)', () => {
  it('turns a scalar into a list for the comparisons that take one', () => {
    // Otherwise the row looks filled in and the engine refuses it at save.
    expect(coerceValue('Financials', 'in')).toEqual(['Financials'])
    expect(coerceValue('', 'in')).toEqual([])
  })

  it('takes the first of a list back to a scalar', () => {
    expect(coerceValue(['Financials', 'Energy'], 'eq')).toBe('Financials')
    expect(coerceValue([], 'eq')).toBe('')
  })

  it('leaves a value alone when the shape already fits', () => {
    expect(coerceValue('Financials', 'eq')).toBe('Financials')
    expect(coerceValue(['A', 'B'], 'in')).toEqual(['A', 'B'])
  })
})

group('blankClause', () => {
  it('starts on the field that was picked, with nothing else assumed', () => {
    const clause = blankClause('reference.sector')
    expect(clause.path).toBe('reference.sector')
    expect(clause.negated).toBe(false)
    expect(clause.value).toBe('')
  })

  it('gives each row an id of its own', () => {
    expect(blankClause('a').id).not.toBe(blankClause('b').id)
  })
})
