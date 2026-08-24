import { describe, expect, it } from 'vitest'
import { datasetsOf, featureRows, featureValue, fieldLabel, rowsOfDataset } from './features'

/** The shape a real engine returns, taken from a live probe. */
const RESPONSE = {
  identifier: 'CMPA',
  as_of: '2026-08-24',
  features: [
    {
      field: 'eps',
      value: 16.61162278690342,
      type: 'fundamentals',
      detail: 'period ending 2026-06-30, reported 2026Q2',
      date: '2026-07-31'
    },
    {
      field: 'pe_ratio',
      value: 10.448232872728154,
      type: 'fundamentals',
      detail: null,
      date: null
    },
    { field: 'wikipedia_views', value: null, type: null, detail: null, date: null }
  ]
}

describe('featureRows', () => {
  it('keeps a field the engine holds nothing for', () => {
    // The endpoint answers with every catalogue field, nulls included. "We
    // hold no sentiment for this name" is an answer, and dropping the row
    // would make the field look like it does not exist.
    const rows = featureRows(RESPONSE)
    expect(rows).toHaveLength(3)
    expect(rows[2]).toMatchObject({ field: 'wikipedia_views', value: null, held: false })
  })

  it('carries the provenance, which is most of why a fundamental is readable', () => {
    expect(rowsOfDataset(featureRows(RESPONSE), 'fundamentals')[0]).toMatchObject({
      date: '2026-07-31',
      detail: 'period ending 2026-06-30, reported 2026Q2'
    })
  })

  it('groups by the dataset the engine named, not by guessing from the field', () => {
    const rows = featureRows(RESPONSE)
    expect(rowsOfDataset(rows, 'fundamentals')).toHaveLength(2)
    // A field with no value has no dataset either, so it groups nowhere.
    expect(rowsOfDataset(rows, 'alternative')).toHaveLength(0)
  })

  it('survives no response at all', () => {
    expect(featureRows(undefined)).toEqual([])
  })
})

describe('featureValue', () => {
  it('gives a ratio decimals and a count none', () => {
    // No format is published, so magnitude is the only signal available.
    expect(featureValue(10.448232872728154)).toBe('10.4482')
    expect(featureValue(360960)).toBe('360,960')
  })

  it('says nothing rather than zero for a field with no value', () => {
    expect(featureValue(null)).toBe('—')
    expect(featureValue(0)).toBe('0')
  })
})

describe('fieldLabel', () => {
  it('makes an engine field name readable without a translation table', () => {
    expect(fieldLabel('debt_to_equity')).toBe('Debt to equity')
    expect(fieldLabel('fundamentals')).toBe('Fundamentals')
  })
})

describe('datasetsOf', () => {
  it('takes the catalogue’s order, so the cards do not shuffle', () => {
    const catalogue = {
      types: [
        { type: 'alternative', fields: ['x_sentiment'], identifiers: 1, rows: 1 },
        { type: 'fundamentals', fields: ['eps'], identifiers: 1, rows: 1 }
      ],
      fields: ['eps', 'x_sentiment']
    }
    expect(datasetsOf(catalogue)).toEqual(['alternative', 'fundamentals'])
  })

  it('is empty for a store generated before features existed', () => {
    expect(datasetsOf({ types: [], fields: [] })).toEqual([])
  })
})
