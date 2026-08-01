import { describe, expect, it } from 'vitest'
import { REFERENCE_CARDS, claimedKeys, indexFields, readField, unclaimedCount } from './reference'

const FIELDS: Record<string, unknown> = {
  NAME: 'Apple Inc.',
  currency: 'USD',
  full_exchange_name: 'NasdaqGS',
  employees: 164_000,
  options_available: true,
  isin: '',
  cusip: null,
  some_column_no_card_claims: 'x'
}

describe('indexFields and readField', () => {
  it('matches whatever case py-beacon used for its columns', () => {
    // Reference columns come from the loaded data, not from a schema — the
    // same fact arrives as NAME from one source and name from another.
    const index = indexFields(FIELDS)
    expect(readField(index, ['name'])).toBe('Apple Inc.')
  })

  it('takes the first alias the engine actually carries', () => {
    const index = indexFields(FIELDS)
    expect(readField(index, ['exchange', 'full_exchange_name'])).toBe('NasdaqGS')
  })

  it('reads booleans as words, since 1 under "Options Available" states nothing', () => {
    expect(readField(indexFields(FIELDS), ['options_available'])).toBe('Yes')
  })

  it('localises numbers', () => {
    expect(readField(indexFields(FIELDS), ['employees'])).toBe('164,000')
  })

  it('treats empty string, null and missing alike — all mean "not carried"', () => {
    const index = indexFields(FIELDS)
    expect(readField(index, ['isin'])).toBe('—')
    expect(readField(index, ['cusip'])).toBe('—')
    expect(readField(index, ['sedol'])).toBe('—')
  })

  it('survives a response with no fields at all', () => {
    expect(readField(indexFields(undefined), ['name'])).toBe('—')
  })
})

describe('REFERENCE_CARDS', () => {
  it('is the four cards of Figma 234:4680, in frame order', () => {
    expect(REFERENCE_CARDS.map((card) => card.title)).toEqual([
      'Identifiers',
      'Classification',
      'Corporate profile',
      'Universe membership'
    ])
  })

  it('never lists the same label twice, which would render two identical rows', () => {
    const labels = REFERENCE_CARDS.flatMap((card) => card.rows.map((row) => row.label))
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('never claims one column under two labels, which would duplicate a value', () => {
    const keys = REFERENCE_CARDS.flatMap((card) => card.rows.flatMap((row) => row.keys))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('indexes its claimed keys in lower case', () => {
    expect(claimedKeys().has('gics_sector')).toBe(true)
    expect(claimedKeys().has('GICS_SECTOR')).toBe(false)
  })
})

describe('unclaimedCount', () => {
  it('counts fields the cards do not show, so the footnote can admit them', () => {
    expect(unclaimedCount(FIELDS)).toBe(1)
  })

  it('does not count blanks as hidden information', () => {
    expect(unclaimedCount({ mystery: '' })).toBe(0)
  })

  it('is zero when there was no response', () => {
    expect(unclaimedCount(undefined)).toBe(0)
  })
})
