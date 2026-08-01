import { describe, expect, it } from 'vitest'
import {
  annualisedVolatility,
  fromFraction,
  lastValue,
  oneDay,
  percent,
  signedPercent,
  sinceStart,
  tone,
  weightRows,
  yearToDate
} from './indexMetrics'
import type { Point } from '../../charts/transform'

const LEVELS: Point[] = [
  { date: '2024-12-30', value: 100 },
  { date: '2024-12-31', value: 110 },
  { date: '2025-06-30', value: 120 },
  { date: '2025-07-01', value: 132 }
]

describe('period slices', () => {
  it('reads the last level', () => {
    expect(lastValue(LEVELS)).toBe(132)
    expect(lastValue([])).toBeUndefined()
  })

  it('measures 1D against the previous observation', () => {
    expect(oneDay(LEVELS)).toBeCloseTo(10, 6)
  })

  it('measures YTD from the last level of the previous year', () => {
    // From 110 (31 Dec 2024) to 132, not from 120 (the first 2025 bar).
    expect(yearToDate(LEVELS)).toBeCloseTo(20, 6)
  })

  it('treats a series that starts inside this year as all of YTD', () => {
    const thisYear: Point[] = [
      { date: '2025-03-01', value: 100 },
      { date: '2025-07-01', value: 150 }
    ]
    expect(yearToDate(thisYear)).toBeCloseTo(50, 6)
  })

  it('measures since-base from the first observation', () => {
    expect(sinceStart(LEVELS)).toBeCloseTo(32, 6)
  })

  it('says nothing rather than dividing by zero', () => {
    const flat: Point[] = [
      { date: '2025-01-01', value: 0 },
      { date: '2025-01-02', value: 5 }
    ]
    expect(sinceStart(flat)).toBeUndefined()
    expect(oneDay([])).toBeUndefined()
    expect(yearToDate([])).toBeUndefined()
  })
})

describe('annualisedVolatility', () => {
  it('is zero for a series that never moves', () => {
    const flat = Array.from({ length: 10 }, (_, i) => ({
      date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      value: 100
    }))
    expect(annualisedVolatility(flat)).toBeCloseTo(0, 6)
  })

  it('grows with the size of the moves', () => {
    const calm = [100, 101, 100, 101, 100, 101].map((value, i) => ({
      date: `2025-01-0${String(i + 1)}`,
      value
    }))
    const wild = [100, 120, 100, 120, 100, 120].map((value, i) => ({
      date: `2025-01-0${String(i + 1)}`,
      value
    }))
    expect(annualisedVolatility(wild)!).toBeGreaterThan(annualisedVolatility(calm)!)
  })

  it('says nothing about a series too short to have a spread', () => {
    expect(annualisedVolatility([{ date: '2025-01-01', value: 100 }])).toBeUndefined()
  })
})

describe('weightRows', () => {
  const weights = { AAPL: 0.2, MSFT: 0.2, ORCL: 0.05, AVGO: 0.15 }

  it('ranks heaviest first', () => {
    expect(weightRows(weights).map((row) => row.ticker)).toEqual(['AAPL', 'MSFT', 'AVGO', 'ORCL'])
    expect(weightRows(weights)[0]?.rank).toBe(1)
  })

  it('scales the bar against the LARGEST name, not against 100%', () => {
    // Ten names all under a fifth of the track would convey nothing about
    // their relative size.
    const rows = weightRows(weights)
    expect(rows[0]?.share).toBe(1)
    expect(rows[3]?.share).toBeCloseTo(0.25, 6)
  })

  it('marks the names the engine says are at the cap', () => {
    const rows = weightRows(weights, ['AAPL', 'MSFT'])
    expect(rows.filter((row) => row.capped).map((row) => row.ticker)).toEqual(['AAPL', 'MSFT'])
  })

  it('survives an index that publishes no weights', () => {
    expect(weightRows({})).toEqual([])
  })
})

describe('formatting', () => {
  it('converts fractions and signs percentages', () => {
    expect(fromFraction(0.207)).toBeCloseTo(20.7, 6)
    expect(signedPercent(20.7)).toBe('+20.7%')
    expect(signedPercent(-33.4)).toBe('−33.4%')
    expect(percent(22.5)).toBe('22.5%')
    expect(percent(undefined)).toBe('—')
  })

  it('gives a flat value no tone, so zero does not read as a gain', () => {
    expect(tone(0)).toBe('default')
    expect(tone(undefined)).toBe('default')
    expect(tone(0.1)).toBe('positive')
    expect(tone(-0.1)).toBe('negative')
  })
})
