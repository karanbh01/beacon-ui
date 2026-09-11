import { describe, expect, it } from 'vitest'
import { cagr, fromFraction, signedPercent, toPoints, type SeriesPayload } from './seriesStats'

const LEVELS: SeriesPayload = {
  name: 'level',
  index: ['2023-12-29', '2024-06-28', '2024-12-31', '2025-12-31'],
  data: [100, 110, 120, 90]
}

describe('toPoints', () => {
  it('pairs a py-beacon Series into chart points', () => {
    expect(toPoints(LEVELS)).toHaveLength(4)
    expect(toPoints(LEVELS)[0]).toEqual({ date: '2023-12-29', value: 100 })
  })

  it('drops nulls rather than plotting the index falling to nothing', () => {
    // py-beacon documents NaN arriving as null.
    const holed: SeriesPayload = { index: ['2024-01-01', '2024-01-02'], data: [null, 5] }
    expect(toPoints(holed).map((point) => point.value)).toEqual([5])
  })

  it('survives a series that never arrived', () => {
    expect(toPoints(undefined)).toEqual([])
  })
})

describe('cagr', () => {
  it('compounds between the first and last level', () => {
    const points = [
      { date: '2020-01-01', value: 100 },
      { date: '2024-01-01', value: 200 }
    ]
    // Roughly 2^(1/4) - 1.
    expect(cagr(points)).toBeCloseTo(18.9, 0)
  })

  it('refuses a span with nothing to divide by', () => {
    expect(cagr([{ date: '2020-01-01', value: 100 }])).toBeUndefined()
    expect(
      cagr([
        { date: '2020-01-01', value: 0 },
        { date: '2024-01-01', value: 10 }
      ])
    ).toBeUndefined()
  })
})

describe('formatting', () => {
  it('converts py-beacon fractions to percentages', () => {
    expect(fromFraction(0.0523)).toBeCloseTo(5.23, 6)
    expect(fromFraction(null)).toBeUndefined()
  })

  it('signs a percentage with a real minus sign', () => {
    expect(signedPercent(20.74)).toBe('+20.7%')
    expect(signedPercent(-33.4)).toBe('−33.4%')
    expect(signedPercent(undefined)).toBe('—')
  })
})
