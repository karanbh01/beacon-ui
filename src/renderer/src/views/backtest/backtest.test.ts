import { describe, expect, it } from 'vitest'
import {
  annualReturns,
  annualTable,
  cagr,
  fromFraction,
  monthlyHitRate,
  signedPercent,
  toPoints,
  type SeriesPayload
} from './backtest'

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

describe('annualReturns', () => {
  it('measures each year from the last level of the previous one', () => {
    const rows = annualReturns(toPoints(LEVELS))

    expect(rows.map((row) => row.year)).toEqual(['2023', '2024', '2025'])
    expect(rows[1]?.value).toBeCloseTo(20, 6)
    expect(rows[2]?.value).toBeCloseTo(-25, 6)
  })

  it('treats the first year as the partial year it is', () => {
    // Measured from its own first observation — there is no prior year-end.
    expect(annualReturns(toPoints(LEVELS))[0]?.value).toBeCloseTo(0, 6)
  })

  it('says nothing about an empty series', () => {
    expect(annualReturns([])).toEqual([])
  })
})

describe('annualTable', () => {
  const benchmark: SeriesPayload = {
    index: ['2023-12-29', '2024-12-31', '2025-12-31'],
    data: [100, 105, 100]
  }

  it('aligns both series by year and reports the excess', () => {
    const rows = annualTable(toPoints(LEVELS), toPoints(benchmark))
    const y2024 = rows.find((row) => row.year === '2024')

    expect(y2024?.index).toBeCloseTo(20, 6)
    expect(y2024?.benchmark).toBeCloseTo(5, 6)
    expect(y2024?.excess).toBeCloseTo(15, 6)
  })

  it('lists newest first, which is how a returns table is read', () => {
    expect(annualTable(toPoints(LEVELS), []).map((row) => row.year)).toEqual([
      '2025',
      '2024',
      '2023'
    ])
  })

  it('leaves excess undefined rather than treating a missing year as zero', () => {
    const rows = annualTable(toPoints(LEVELS), [])
    expect(rows[0]?.excess).toBeUndefined()
  })
})

describe('monthlyHitRate', () => {
  it('counts the months that ended above where they started', () => {
    const points = [
      { date: '2025-01-31', value: 100 },
      { date: '2025-02-28', value: 110 },
      { date: '2025-03-31', value: 105 },
      { date: '2025-04-30', value: 120 }
    ]
    // Three transitions, two of them up.
    expect(monthlyHitRate(points)).toBeCloseTo((2 / 3) * 100, 6)
  })

  it('says nothing when there is only one month to judge', () => {
    expect(monthlyHitRate([{ date: '2025-01-31', value: 100 }])).toBeUndefined()
    expect(monthlyHitRate([])).toBeUndefined()
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
