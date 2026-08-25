import { describe, expect, it } from 'vitest'
import { featureValue, fieldLabel, fieldsIn, historyRows, within } from './features'

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

describe('historyRows (BU-113)', () => {
  const PAGE = {
    dataset: 'features',
    offset: 0,
    limit: 1000,
    total: 4,
    rows: {
      index: [0, 1, 2, 3],
      columns: ['IDENTIFIER', 'DATE', 'TYPE', 'FIELD', 'VALUE', 'DETAIL'],
      data: [
        ['CMPA', '2026-04-30T00:00:00', 'fundamentals', 'pe_ratio', 10.4, null],
        ['CMPA', '2026-07-31T00:00:00', 'fundamentals', 'eps', 16.6, 'reported 2026Q2'],
        ['CMPA', '2026-04-30T00:00:00', 'fundamentals', 'eps', 16.1, 'reported 2026Q1'],
        ['CMPA', '2026-07-31T00:00:00', 'fundamentals', 'pe_ratio', null, null]
      ]
    }
  }

  it('reads columns by name rather than by position', () => {
    // The endpoint documents a frame, not an order of columns — indexing into
    // data[i][j] would break silently the day one is added.
    const rows = historyRows(PAGE)
    expect(rows[0]).toMatchObject({ field: 'eps', value: 16.6, dataset: 'fundamentals' })
  })

  it('sorts newest first, since the current value is what is wanted', () => {
    // Sorted here rather than assumed: a page of a stored table promises no
    // order.
    expect(historyRows(PAGE).map((row) => row.date)).toEqual([
      '2026-07-31',
      '2026-07-31',
      '2026-04-30',
      '2026-04-30'
    ])
  })

  it('trims the midnight off a date', () => {
    expect(historyRows(PAGE)[0]?.date).toBe('2026-07-31')
  })

  it('keeps a null value as null rather than as zero', () => {
    const missing = historyRows(PAGE).find((row) => row.field === 'pe_ratio')
    expect(missing?.value).toBeNull()
  })

  it('survives no page at all', () => {
    expect(historyRows(undefined)).toEqual([])
  })
})

describe('fieldsIn', () => {
  it('lists each field once, for the filter', () => {
    const rows = [
      { key: '0', date: '2026-07-31', dataset: 'f', field: 'eps', value: 1, detail: undefined },
      { key: '1', date: '2026-04-30', dataset: 'f', field: 'eps', value: 2, detail: undefined },
      { key: '2', date: '2026-04-30', dataset: 'f', field: 'pe_ratio', value: 3, detail: undefined }
    ]
    expect(fieldsIn(rows)).toEqual(['eps', 'pe_ratio'])
  })
})

describe('within (BU-113)', () => {
  const rows = [
    { key: '0', date: '2026-07-31', dataset: 'f', field: 'eps', value: 1, detail: undefined },
    { key: '1', date: '2025-07-31', dataset: 'f', field: 'eps', value: 2, detail: undefined },
    { key: '2', date: '2024-07-31', dataset: 'f', field: 'eps', value: 3, detail: undefined }
  ]

  it('keeps both ends optional, so a half-set window still narrows', () => {
    expect(within(rows, '2025-01-01', '').map((row) => row.date)).toEqual([
      '2026-07-31',
      '2025-07-31'
    ])
    expect(within(rows, '', '2025-01-01').map((row) => row.date)).toEqual(['2024-07-31'])
  })

  it('is inclusive of both bounds', () => {
    expect(within(rows, '2025-07-31', '2025-07-31')).toHaveLength(1)
  })

  it('returns everything when neither end is set', () => {
    expect(within(rows, '', '')).toHaveLength(3)
  })
})
