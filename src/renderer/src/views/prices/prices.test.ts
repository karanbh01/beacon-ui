import { describe, expect, it } from 'vitest'
import { findColumn, num, toRows, type TableFrame } from '../../api/frame'
import { compactVolume, price, signedPercent, summarise } from './summary'
import { rangeStart } from './usePrices'

const FRAME: TableFrame = {
  index: ['2026-07-17T00:00:00', '2026-07-20T00:00:00', '2026-07-21T00:00:00'],
  columns: ['open', 'high', 'low', 'close', 'adj close', 'volume'],
  data: [
    [207.55, 209.72, 206.8, 208.9, 208.9, 61_342_900],
    [208.9, 210.45, 207.98, 209.65, 209.65, 49_807_400],
    [209.88, 212.1, 209.35, 211.42, 211.42, 54_183_200]
  ]
}

describe('toRows', () => {
  it('keys cells by column name so views never index by position', () => {
    const rows = toRows(FRAME)

    expect(rows).toHaveLength(3)
    expect(rows[2]?.close).toBe(211.42)
    expect(rows[2]?.index).toBe('2026-07-21T00:00:00')
  })

  it('returns nothing for a missing frame', () => {
    expect(toRows(undefined)).toEqual([])
  })
})

describe('num', () => {
  it('reads a finite number', () => {
    expect(num(toRows(FRAME)[0], 'close')).toBe(208.9)
  })

  it('treats null, missing and NaN alike — all mean "no number here"', () => {
    // py-beacon documents NaN arriving as null; a missing column is the same
    // thing at the call site, and both must render as a dash.
    const frame: TableFrame = { index: ['a'], columns: ['close'], data: [[null]] }
    expect(num(toRows(frame)[0], 'close')).toBeUndefined()
    expect(num(toRows(frame)[0], 'nope')).toBeUndefined()
    expect(num(undefined, 'close')).toBeUndefined()
  })
})

describe('findColumn', () => {
  it('matches case-insensitively and takes the first alias that hits', () => {
    expect(findColumn(FRAME, 'Close')).toBe('close')
    expect(findColumn(FRAME, 'adj_close', 'adj close')).toBe('adj close')
    expect(findColumn(FRAME, 'nope')).toBeUndefined()
  })
})

describe('summarise', () => {
  it('takes the last row as the latest bar', () => {
    // A date-indexed pandas frame arrives newest-last.
    expect(summarise(FRAME).lastClose).toBe(211.42)
  })

  it('computes the 1D change against the previous close', () => {
    const summary = summarise(FRAME)

    expect(summary.changeAbs).toBeCloseTo(1.77, 2)
    expect(summary.changePct).toBeCloseTo(0.84, 2)
  })

  it('takes the 52w range from highs and lows, not closes', () => {
    const summary = summarise(FRAME)

    expect(summary.high52).toBe(212.1)
    expect(summary.low52).toBe(206.8)
  })

  it('averages volume over the trailing window', () => {
    const summary = summarise(FRAME)
    expect(summary.avgVolume3M).toBeCloseTo((61_342_900 + 49_807_400 + 54_183_200) / 3, 0)
  })

  it('reports the span', () => {
    const summary = summarise(FRAME)

    expect(summary.firstDate).toBe('2026-07-17')
    expect(summary.lastDate).toBe('2026-07-21')
  })

  it('survives a single row, where there is no previous close', () => {
    const single: TableFrame = { index: ['2026-07-21'], columns: ['close'], data: [[211.42]] }
    const summary = summarise(single)

    expect(summary.lastClose).toBe(211.42)
    expect(summary.changeAbs).toBeUndefined()
  })

  it('survives an empty frame rather than throwing', () => {
    const summary = summarise({ index: [], columns: ['close'], data: [] })

    expect(summary.rows).toEqual([])
    expect(summary.lastClose).toBeUndefined()
  })

  it('falls back to adj close when close is absent', () => {
    const frame: TableFrame = {
      index: ['a', 'b'],
      columns: ['adj close'],
      data: [[100], [110]]
    }
    const summary = summarise(frame)

    expect(summary.lastClose).toBe(110)
    expect(summary.changePct).toBeCloseTo(10, 4)
  })

  it('does not divide by a zero previous close', () => {
    const frame: TableFrame = { index: ['a', 'b'], columns: ['close'], data: [[0], [110]] }
    expect(summarise(frame).changePct).toBeUndefined()
  })
})

describe('formatting', () => {
  it('compacts volume, which is unreadable at full precision', () => {
    expect(compactVolume(58_400_000)).toBe('58.4M')
    expect(compactVolume(1_240_000_000)).toBe('1.2B')
    expect(compactVolume(4_300)).toBe('4.3k')
    expect(compactVolume(undefined)).toBe('—')
  })

  it('renders a missing price as a dash, never NaN', () => {
    expect(price(undefined)).toBe('—')
    expect(price(211.4)).toBe('211.40')
  })

  it('uses a true minus sign for negatives, matching the design', () => {
    expect(signedPercent(0.84)).toBe('+0.84%')
    expect(signedPercent(-0.41)).toBe('−0.41%')
  })
})

describe('rangeStart', () => {
  const now = new Date('2026-07-21T00:00:00Z')

  it('walks back the right number of months', () => {
    expect(rangeStart('1M', now)).toBe('2026-06-21')
    expect(rangeStart('1Y', now)).toBe('2025-07-21')
    expect(rangeStart('5Y', now)).toBe('2021-07-21')
  })

  it('sends no start for MAX, so the server decides', () => {
    expect(rangeStart('MAX', now)).toBeUndefined()
  })
})
