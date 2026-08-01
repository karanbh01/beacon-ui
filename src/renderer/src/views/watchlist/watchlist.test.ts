import { describe, expect, it } from 'vitest'
import type { TableFrame } from '../../api/frame'
import { buildRow, compactCap, sparkPoints, summariseRows } from './watchlist'

/** 30 sessions straddling a year end, so YTD has a prior year to measure from. */
function frame(): TableFrame {
  const index: string[] = []
  const data: number[][] = []

  for (let day = 0; day < 30; day++) {
    const year = day < 10 ? 2025 : 2026
    const dayOfMonth = String((day % 28) + 1).padStart(2, '0')
    index.push(`${String(year)}-${day < 10 ? '12' : '01'}-${dayOfMonth}T00:00:00`)
    data.push([100 + day, 1_000_000 + day])
  }

  return { index, columns: ['close', 'volume'], data }
}

describe('buildRow', () => {
  it('reads the latest bar for last and volume', () => {
    const row = buildRow({ ticker: 'AAPL', prices: frame(), reference: undefined, pending: false })

    expect(row.last).toBe(129)
    expect(row.volume).toBe(1_000_029)
  })

  it('measures YTD from the last close of the previous year', () => {
    // Not from the first bar of this year: a stock that gapped on 2 January
    // would otherwise show none of the move everyone means by "year to date".
    const row = buildRow({ ticker: 'AAPL', prices: frame(), reference: undefined, pending: false })

    // Prior-year close is 109 (day 9); latest is 129.
    expect(row.changeYTD).toBeCloseTo(((129 - 109) / 109) * 100, 6)
  })

  it('measures 1D from the previous session', () => {
    const row = buildRow({ ticker: 'AAPL', prices: frame(), reference: undefined, pending: false })
    expect(row.change1D).toBeCloseTo(((129 - 128) / 128) * 100, 6)
  })

  it('takes name and market cap from reference, case-insensitively', () => {
    const row = buildRow({
      ticker: 'AAPL',
      prices: frame(),
      reference: { NAME: 'Apple Inc.', Market_Cap: 3.16e12 },
      pending: false
    })

    expect(row.name).toBe('Apple Inc.')
    expect(row.marketCap).toBe(3.16e12)
  })

  it('renders nothing rather than zero when the engine has not answered', () => {
    const row = buildRow({ ticker: 'AAPL', prices: undefined, reference: undefined, pending: true })

    expect(row.last).toBeUndefined()
    expect(row.changeYTD).toBeUndefined()
    expect(row.spark).toEqual([])
    expect(row.pending).toBe(true)
  })

  it('falls back to adjusted close when the frame has no close column', () => {
    const adjusted: TableFrame = {
      index: ['2026-01-01', '2026-01-02'],
      columns: ['adj close'],
      data: [[10], [11]]
    }
    const row = buildRow({ ticker: 'X', prices: adjusted, reference: undefined, pending: false })
    expect(row.last).toBe(11)
  })
})

describe('summariseRows', () => {
  const rows = [
    buildRow({ ticker: 'A', prices: frame(), reference: undefined, pending: false }),
    buildRow({ ticker: 'B', prices: undefined, reference: undefined, pending: true })
  ]

  it('counts only rows that have arrived, not loading ones as flat', () => {
    const summary = summariseRows(rows)

    expect(summary.symbols).toBe(2)
    expect(summary.up).toBe(1)
    expect(summary.down).toBe(0)
  })

  it('ranks best and worst by YTD', () => {
    const summary = summariseRows(rows)
    expect(summary.best?.ticker).toBe('A')
    expect(summary.worst?.ticker).toBe('A')
  })

  it('says nothing about an empty watchlist rather than reporting zeros', () => {
    const summary = summariseRows([])
    expect(summary.averageDay).toBeUndefined()
    expect(summary.best).toBeUndefined()
  })
})

describe('compactCap', () => {
  it('scales to the unit a reader expects', () => {
    expect(compactCap(3.16e12)).toBe('3.16T')
    expect(compactCap(2.784e11)).toBe('278.4B')
    expect(compactCap(4.2e6)).toBe('4.2M')
  })

  it('says nothing when reference did not carry one', () => {
    expect(compactCap(undefined)).toBe('—')
  })
})

describe('sparkPoints', () => {
  it('spans the full box, low at the bottom', () => {
    expect(sparkPoints([1, 2, 3], 90, 18)).toBe('0.00,18.00 45.00,9.00 90.00,0.00')
  })

  it('draws a flat series down the middle instead of dividing by zero', () => {
    // A zero range would put every y at NaN and render nothing at all.
    expect(sparkPoints([5, 5], 90, 18)).toBe('0.00,9.00 90.00,9.00')
  })

  it('draws nothing from a single point, which has no direction', () => {
    expect(sparkPoints([5], 90, 18)).toBe('')
    expect(sparkPoints([], 90, 18)).toBe('')
  })
})
