import { describe, expect, it } from 'vitest'
import {
  bucketOf,
  extremes,
  hitRate,
  periodDrawdown,
  periodReturns,
  periodTable,
  periodVolatility
} from './periods'
import { toPoints, type SeriesPayload } from './seriesStats'

const LEVELS: SeriesPayload = {
  name: 'level',
  index: ['2023-12-29', '2024-06-28', '2024-12-31', '2025-12-31'],
  data: [100, 110, 120, 90]
}

/** A year of business-ish days, so a volatility has something to measure. */
function walk(days: number, step: (i: number) => number): { date: string; value: number }[] {
  const points: { date: string; value: number }[] = []
  let value = 100
  for (let i = 0; i < days; i++) {
    value *= 1 + step(i)
    points.push({
      date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
      value
    })
  }
  return points
}

describe('bucketOf', () => {
  it('names a bucket so that it sorts in calendar order', () => {
    // Lexical order has to be calendar order: every table here sorts on it.
    expect(bucketOf('2025-07-14', 'annual')).toBe('2025')
    expect(bucketOf('2025-07-14', 'monthly')).toBe('2025-07')
    expect(bucketOf('2025-07-14', 'quarterly')).toBe('2025 Q3')
    expect(bucketOf('2025-01-01', 'quarterly') < bucketOf('2025-04-01', 'quarterly')).toBe(true)
  })

  it('puts each quarter’s three months together', () => {
    expect(bucketOf('2025-01-31', 'quarterly')).toBe('2025 Q1')
    expect(bucketOf('2025-03-31', 'quarterly')).toBe('2025 Q1')
    expect(bucketOf('2025-12-31', 'quarterly')).toBe('2025 Q4')
  })
})

describe('periodReturns', () => {
  it('measures each bucket from the last level of the previous one', () => {
    const rows = periodReturns(toPoints(LEVELS), 'annual')

    expect(rows.map((row) => row.bucket)).toEqual(['2024', '2025'])
    expect(rows[0]?.value).toBeCloseTo(20, 6)
    expect(rows[1]?.value).toBeCloseTo(-25, 6)
  })

  it('treats a first bucket that traded as the partial period it is', () => {
    // Measured from its own first observation — there is no prior close.
    const partial = periodReturns(
      toPoints({ index: ['2024-02-01', '2024-06-28', '2024-12-31'], data: [100, 110, 120] }),
      'annual'
    )

    expect(partial.map((row) => row.bucket)).toEqual(['2024'])
    expect(partial[0]?.value).toBeCloseTo(20, 6)
  })

  it('drops a first bucket holding one observation, which can only say 0.0%', () => {
    /*
     * It would be measured against itself. That reads as a period that went
     * nowhere rather than one that never traded — and a stored backtest
     * record makes it ordinary, since its NAV opens on day zero, often the
     * last day of the period before the run (BU-169).
     */
    expect(periodReturns(toPoints(LEVELS), 'annual').map((row) => row.bucket)).not.toContain('2023')
  })

  it('includes the first day of a bucket in that bucket’s return', () => {
    // First-to-last WITHIN the bucket would lose the move on the 1st, which
    // is a real return that belongs to the month it happened in.
    const points = [
      { date: '2025-01-31', value: 100 },
      { date: '2025-02-01', value: 110 },
      { date: '2025-02-28', value: 110 }
    ]
    expect(periodReturns(points, 'monthly')[0]?.value).toBeCloseTo(10, 6)
  })

  it('says nothing about an empty series', () => {
    expect(periodReturns([], 'quarterly')).toEqual([])
  })
})

describe('periodTable', () => {
  const benchmark: SeriesPayload = {
    index: ['2023-12-29', '2024-12-31', '2025-12-31'],
    data: [100, 105, 100]
  }

  it('aligns both series by bucket and reports the excess', () => {
    const rows = periodTable(toPoints(LEVELS), toPoints(benchmark), 'annual')
    const y2024 = rows.find((row) => row.bucket === '2024')

    expect(y2024?.index).toBeCloseTo(20, 6)
    expect(y2024?.benchmark).toBeCloseTo(5, 6)
    expect(y2024?.excess).toBeCloseTo(15, 6)
  })

  it('lists newest first, which is how a returns table is read', () => {
    expect(periodTable(toPoints(LEVELS), [], 'annual').map((row) => row.bucket)).toEqual([
      '2025',
      '2024'
    ])
  })

  it('leaves excess undefined rather than treating a missing bucket as zero', () => {
    expect(periodTable(toPoints(LEVELS), [], 'annual')[0]?.excess).toBeUndefined()
  })
})

describe('periodVolatility', () => {
  it('annualises, so a month and a year are comparable figures', () => {
    // A constant 1% daily move has zero dispersion; alternating ±1% does not.
    const points = walk(60, (i) => (i % 2 === 0 ? 0.01 : -0.01))
    const rows = periodVolatility(points, 'monthly')

    expect(rows.length).toBeGreaterThan(0)
    // ~1% daily against √252 is about 16% annualised.
    expect(rows[0]?.value).toBeGreaterThan(10)
    expect(rows[0]?.value).toBeLessThan(25)
  })

  it('reports nothing for a bucket too short to have a dispersion', () => {
    // Zero would be a claim: one observation is not a calm month.
    expect(periodVolatility([{ date: '2025-01-31', value: 100 }], 'monthly')).toEqual([])
  })
})

describe('periodDrawdown', () => {
  it('measures from the peak inside the bucket, not from the series high', () => {
    // The quarter opens below January's high; its own drawdown is 20%.
    const points = [
      { date: '2025-01-15', value: 200 },
      { date: '2025-04-01', value: 100 },
      { date: '2025-05-01', value: 120 },
      { date: '2025-06-01', value: 96 }
    ]
    const q2 = periodDrawdown(points, 'quarterly').find((row) => row.bucket === '2025 Q2')

    expect(q2?.value).toBeCloseTo(-20, 6)
  })

  it('reports zero for a bucket that only rose', () => {
    const points = [
      { date: '2025-01-01', value: 100 },
      { date: '2025-01-31', value: 110 }
    ]
    expect(periodDrawdown(points, 'monthly')[0]?.value).toBe(0)
  })
})

describe('hitRate', () => {
  it('counts the buckets that closed above the one before', () => {
    const points = [
      { date: '2025-01-31', value: 100 },
      { date: '2025-02-28', value: 110 },
      { date: '2025-03-31', value: 105 },
      { date: '2025-04-30', value: 120 }
    ]
    // Three transitions, two of them up.
    expect(hitRate(points, 'monthly')).toBeCloseTo((2 / 3) * 100, 6)
  })

  it('says nothing when there is only one bucket to judge', () => {
    expect(hitRate([{ date: '2025-01-31', value: 100 }], 'monthly')).toBeUndefined()
    expect(hitRate([], 'annual')).toBeUndefined()
  })
})

describe('extremes', () => {
  it('names the best and worst buckets so the table need not be scanned', () => {
    const rows = [
      { bucket: '2023', value: 5 },
      { bucket: '2024', value: -12 },
      { bucket: '2025', value: 20 }
    ]
    expect(extremes(rows).best?.bucket).toBe('2025')
    expect(extremes(rows).worst?.bucket).toBe('2024')
  })

  it('has neither when there is nothing', () => {
    expect(extremes([])).toEqual({ best: undefined, worst: undefined })
  })
})
