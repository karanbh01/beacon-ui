import { describe, expect, it } from 'vitest'
import type { components } from '@shared/api.generated'
import { formatReference, holdingColumns, lowerKeys, referenceChoices } from './holdingColumns'

type FieldDescriptor = components['schemas']['FieldDescriptor']

const field = (over: Partial<FieldDescriptor> & { name: string }): FieldDescriptor => ({
  namespace: 'reference',
  derived: false,
  label: '',
  path: `reference.${over.name}`,
  ...over
})

describe('the columns a chooser offers (py-beacon 0.9.2, BN-325)', () => {
  it('are the stored reference columns, labelled as the engine labels them', () => {
    const choices = referenceChoices([
      field({ name: 'sector', label: 'Sector' }),
      field({ name: 'country_domicile', label: 'Country of domicile' }),
      field({ name: 'market_cap', label: 'Market cap', derived: true }),
      field({ name: 'close', namespace: 'market', label: 'Close' }),
      field({ name: 'date_from', label: 'Valid from' })
    ])

    expect(choices).toEqual([
      { key: 'sector', label: 'Sector' },
      { key: 'country_domicile', label: 'Country of domicile' }
    ])
  })

  it('puts an unlabelled column into words', () => {
    expect(referenceChoices([field({ name: 'SUB_INDUSTRY' })])).toEqual([
      { key: 'sub_industry', label: 'Sub industry' }
    ])
  })
})

describe('the columns every ticker table shares', () => {
  const columns = holdingColumns<{ ticker: string; reference: Record<string, unknown> | null }>(
    (row) => row.ticker,
    (row) => row.reference,
    [
      { key: 'name', label: 'Name' },
      { key: 'sector', label: 'Sector' }
    ]
  )

  it('are the ticker, then the chosen columns in the order chosen', () => {
    expect(columns.map((column) => column.header)).toEqual(['Ticker', 'Name', 'Sector'])
  })

  it("show the engine's values, and a dash where the name had no reference row", () => {
    const held = { ticker: 'AAPL', reference: { name: 'Apple Inc.', sector: null } }
    expect(columns.map((column) => column.render(held))).toEqual(['AAPL', 'Apple Inc.', '—'])
    expect(columns[1]?.render({ ticker: 'ZZZ', reference: null })).toBe('—')
  })

  it('are text, so none is centred as a number or right-aligned as a row name', () => {
    expect(columns.every((column) => column.align === undefined && column.rowName !== true)).toBe(
      true
    )
  })
})

describe('a reference value as text', () => {
  it('keeps a string, separates a number, and trims a timestamp to its day', () => {
    expect(formatReference('Equity')).toBe('Equity')
    expect(formatReference(12500)).toBe('12,500')
    expect(formatReference(true)).toBe('Yes')
    expect(formatReference('2019-06-03T00:00:00')).toBe('2019-06-03')
    expect(formatReference(undefined)).toBe('—')
  })

  it('reads a /data/reference row keyed in any case', () => {
    expect(lowerKeys({ NAME: 'AAA Corp', Sector: 'Energy' })).toEqual({
      name: 'AAA Corp',
      sector: 'Energy'
    })
  })
})
