import { describe, expect, it } from 'vitest'
import {
  applyQuery,
  isFiltered,
  NO_QUERY,
  withFilter,
  withSort,
  type CellValue
} from './tableQuery'

interface Row {
  ticker: string
  sector: string
  weight: number | undefined
}

const ROWS: Row[] = [
  { ticker: 'AAA', sector: 'Tech', weight: 12 },
  { ticker: 'BBB', sector: 'Energy', weight: 4 },
  { ticker: 'CCC', sector: 'Tech', weight: undefined },
  { ticker: 'DDD', sector: 'Health', weight: 8 }
]

const VALUES: Record<string, (row: Row) => CellValue> = {
  ticker: (row) => row.ticker,
  sector: (row) => row.sector,
  weight: (row) => row.weight
}
const valueOf = (key: string): ((row: Row) => CellValue) | undefined => VALUES[key]
const tickers = (rows: readonly Row[]): string[] => rows.map((row) => row.ticker)

describe('sorting a results table (Karan, 2026-10-19)', () => {
  it('sorts numbers either way, with a blank last both times', () => {
    const up = withSort(NO_QUERY, 'weight', 'asc')
    const down = withSort(NO_QUERY, 'weight', 'desc')

    expect(tickers(applyQuery(ROWS, valueOf, up))).toEqual(['BBB', 'DDD', 'AAA', 'CCC'])
    expect(tickers(applyQuery(ROWS, valueOf, down))).toEqual(['AAA', 'DDD', 'BBB', 'CCC'])
  })

  it('leaves the order alone with no sort', () => {
    expect(applyQuery(ROWS, valueOf, NO_QUERY)).toBe(ROWS)
  })
})

describe('filtering a results table', () => {
  it('keeps the ticked values of a column with few of them', () => {
    const query = withFilter(NO_QUERY, 'sector', { values: ['Tech'] })
    expect(tickers(applyQuery(ROWS, valueOf, query))).toEqual(['AAA', 'CCC'])
    expect(isFiltered(query)).toBe(true)
  })

  it('keeps numbers in a range, and drops a blank from it', () => {
    const query = withFilter(NO_QUERY, 'weight', { min: 5 })
    expect(tickers(applyQuery(ROWS, valueOf, query))).toEqual(['AAA', 'DDD'])
  })

  it('keeps text containing what was typed, whatever its case', () => {
    const query = withFilter(NO_QUERY, 'ticker', { text: 'bb' })
    expect(tickers(applyQuery(ROWS, valueOf, query))).toEqual(['BBB'])
  })

  it('combines filters and a sort, and drops a filter set to nothing', () => {
    const both = withSort(
      withFilter(NO_QUERY, 'sector', { values: ['Tech', 'Health'] }),
      'weight',
      'desc'
    )
    expect(tickers(applyQuery(ROWS, valueOf, both))).toEqual(['AAA', 'DDD', 'CCC'])

    const cleared = withFilter(both, 'sector', undefined)
    expect(isFiltered(cleared)).toBe(false)
    expect(cleared.sort).toEqual({ key: 'weight', direction: 'desc' })
  })
})
