import { describe, expect, it } from 'vitest'
import type { ConstraintSet } from '../shared/optimiseQueries'
import {
  addConstraint,
  describeConstraint,
  isDirty,
  moveConstraint,
  nextConstraintId,
  removeConstraint,
  replaceConstraint
} from './constraints'

const CATALOGUE = {
  PositionBounds: ['lower', 'upper'],
  TurnoverLimit: ['maximum'],
  FullyInvested: []
}

function set(): ConstraintSet {
  return {
    id: 'TECH10-BASE',
    name: 'TECH10 base',
    constraints: [
      { id: 'c1', type: 'PositionBounds', params: { lower: 0, upper: 0.2 } },
      { id: 'c2', type: 'TurnoverLimit', params: { maximum: 0.05 } }
    ]
  }
}

describe('describeConstraint', () => {
  it('orders parameters by the catalogue, not by object key order', () => {
    // The catalogue is the authority on what a class takes, so the sentence
    // is stable between renders and between engines.
    const scrambled = { id: 'c1', type: 'PositionBounds', params: { upper: 0.2, lower: 0 } }
    expect(describeConstraint(scrambled, CATALOGUE)).toBe('lower 0 · upper 20%')
  })

  it('renders a fraction as a percentage', () => {
    // A bare 0.05 in a turnover row reads as 0.05%, which is a hundred times
    // wrong.
    expect(describeConstraint(set().constraints![1]!, CATALOGUE)).toBe('maximum 5%')
  })

  it('says so when a constraint takes nothing', () => {
    expect(describeConstraint({ id: 'c3', type: 'FullyInvested' }, CATALOGUE)).toBe('no parameters')
  })

  it('falls back to the object’s own keys without a catalogue', () => {
    expect(describeConstraint({ id: 'c1', type: 'X', params: { a: 1 } })).toBe('a 1')
  })
})

describe('draft transitions', () => {
  it('never reuses an id', () => {
    const added = addConstraint(set(), 'FullyInvested')
    const ids = (added.constraints ?? []).map((row) => row.id)
    expect(new Set(ids).size).toBe(ids.length)
    // The set now holds c1, c2 and c3, so the next free id is c4.
    expect(nextConstraintId(added)).toBe('c4')
  })

  it('adds, replaces and removes without touching the set’s identity', () => {
    const before = set()
    const after = removeConstraint(
      replaceConstraint(addConstraint(before, 'FullyInvested'), {
        id: 'c1',
        type: 'TurnoverLimit'
      }),
      'c2'
    )

    expect((after.constraints ?? []).map((row) => row.type)).toEqual([
      'TurnoverLimit',
      'FullyInvested'
    ])
    expect(after.id).toBe(before.id)
    expect(after.name).toBe(before.name)
  })

  it('reorders for readability only — constraints apply simultaneously', () => {
    // Unlike an index pipeline, where order changes the result, this is a
    // display preference.
    const moved = moveConstraint(set(), 'c2', -1)
    expect((moved.constraints ?? []).map((row) => row.id)).toEqual(['c2', 'c1'])
  })

  it('refuses a move off either end', () => {
    const before = set()
    expect(moveConstraint(before, 'c1', -1)).toBe(before)
    expect(moveConstraint(before, 'c2', 1)).toBe(before)
    expect(moveConstraint(before, 'nope', 1)).toBe(before)
  })

  it('does not mutate the set handed in', () => {
    const before = set()
    const snapshot = JSON.stringify(before)
    addConstraint(before, 'FullyInvested')
    removeConstraint(before, 'c1')
    moveConstraint(before, 'c1', 1)
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('isDirty', () => {
  it('treats an unsaved set as dirty', () => {
    expect(isDirty(set(), undefined)).toBe(true)
  })

  it('is false for an untouched draft', () => {
    expect(isDirty(set(), set())).toBe(false)
  })

  it('notices a parameter change', () => {
    const edited = replaceConstraint(set(), {
      id: 'c2',
      type: 'TurnoverLimit',
      params: { maximum: 0.1 }
    })
    expect(isDirty(edited, set())).toBe(true)
  })
})
