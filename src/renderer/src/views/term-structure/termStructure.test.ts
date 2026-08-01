import { describe, expect, it } from 'vitest'
import {
  defaultExpiries,
  describeShape,
  isMonotonic,
  parseExpiries,
  type CurvePoint
} from './termStructure'

function point(timeToExpiry: number, theoretical: number): CurvePoint {
  return {
    expiry: `2026-0${String(timeToExpiry)}-01`,
    timeToExpiry,
    theoretical,
    financingRate: 0.04,
    overSpot: 0
  }
}

describe('describeShape', () => {
  it('names the shape by py-beacon’s sign convention, not by intuition', () => {
    // annualised_roll is POSITIVE in backwardation — the roll earns when the
    // curve slopes down — which is the opposite sign to "over spot".
    expect(describeShape(0.03)).toBe('backwardation')
    expect(describeShape(-0.03)).toBe('contango')
    expect(describeShape(0)).toBe('flat')
  })
})

describe('defaultExpiries', () => {
  it('offers quarter-ends after the given date', () => {
    const expiries = defaultExpiries(new Date('2026-01-15T00:00:00Z'), 4)
    expect(expiries).toEqual(['2026-03-31', '2026-06-30', '2026-09-30', '2026-12-31'])
  })

  it('rolls into the next year when the year runs out', () => {
    const expiries = defaultExpiries(new Date('2026-11-01T00:00:00Z'), 3)
    expect(expiries).toEqual(['2026-12-31', '2027-03-31', '2027-06-30'])
  })

  it('never offers an expiry in the past', () => {
    for (const expiry of defaultExpiries(new Date('2026-04-01T00:00:00Z'))) {
      expect(expiry > '2026-04-01').toBe(true)
    }
  })
})

describe('parseExpiries', () => {
  it('accepts a comma or space separated list', () => {
    expect(parseExpiries('2026-03-31, 2026-06-30  2026-09-30')).toEqual([
      '2026-03-31',
      '2026-06-30',
      '2026-09-30'
    ])
  })

  it('drops anything that is not a date rather than sending it', () => {
    // py-beacon 422s on a malformed expiry, and the pane would show a
    // validation failure the user cannot connect to what they typed.
    expect(parseExpiries('2026-03-31, soon, ,')).toEqual(['2026-03-31'])
  })
})

describe('isMonotonic', () => {
  it('is true for a curve that only rises', () => {
    expect(isMonotonic([point(1, 100), point(2, 101), point(3, 105)])).toBe(true)
  })

  it('is false the moment it dips', () => {
    expect(isMonotonic([point(1, 100), point(2, 99)])).toBe(false)
  })

  it('is vacuously true for a single contract', () => {
    expect(isMonotonic([point(1, 100)])).toBe(true)
  })
})
