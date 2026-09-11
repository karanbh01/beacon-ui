import { describe, expect, it } from 'vitest'
import type { Point } from '../../charts/transform'
import {
  alignReturns,
  correlation,
  correlationOf,
  expectedShortfall,
  historicalVar,
  informationRatio,
  parametricVar,
  rollingCorrelation,
  rollingVolatility
} from './risk'

/** A deterministic walk: no RNG, so a failure is always reproducible. */
function series(days: number, step: (i: number) => number, from = '2025-01-01'): Point[] {
  const start = Date.parse(`${from}T00:00:00Z`)
  const points: Point[] = []
  let value = 100
  for (let i = 0; i < days; i++) {
    value *= 1 + step(i)
    points.push({
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      value
    })
  }
  return points
}

const WOBBLE = series(300, (i) => Math.sin(i / 3) / 100)

describe('value at risk (BU-176)', () => {
  it('reports a loss as a positive number', () => {
    // "2.1%" reads as a loss of that much, not a return of it.
    const value = historicalVar(WOBBLE, 0.95)
    expect(value).toBeGreaterThan(0)
  })

  it('gets worse as the confidence rises, which is what confidence means', () => {
    const ninety = historicalVar(WOBBLE, 0.9) ?? 0
    const ninetyNine = historicalVar(WOBBLE, 0.99) ?? 0
    expect(ninetyNine).toBeGreaterThan(ninety)
  })

  it('refuses a series too short to have a tail', () => {
    // Twenty returns is already thin for a 99% quantile; fewer is fiction.
    expect(
      historicalVar(
        series(10, () => 0.01),
        0.95
      )
    ).toBeUndefined()
    expect(
      parametricVar(
        series(10, () => 0.01),
        0.95
      )
    ).toBeUndefined()
    expect(
      expectedShortfall(
        series(10, () => 0.01),
        0.95
      )
    ).toBeUndefined()
  })

  it('agrees with the parametric figure on a well-behaved series', () => {
    // Not a law — where they diverge, the divergence is the information —
    // but on a symmetric wobble they should be in the same neighbourhood.
    const historical = historicalVar(WOBBLE, 0.95) ?? 0
    const parametric = parametricVar(WOBBLE, 0.95) ?? 0
    expect(Math.abs(historical - parametric)).toBeLessThan(0.5)
  })

  it('puts expected shortfall beyond the VaR it conditions on', () => {
    const value = historicalVar(WOBBLE, 0.95) ?? 0
    expect(expectedShortfall(WOBBLE, 0.95) ?? 0).toBeGreaterThanOrEqual(value)
  })
})

describe('aligning two series (BU-176)', () => {
  it('pairs by date, not by position', () => {
    /*
     * The classic silent wrong answer: two arrays zipped by index when one
     * of them is missing a day. Here the benchmark has no 02, so the index's
     * 02 must not be paired with the benchmark's 03.
     */
    const left: Point[] = [
      { date: '2025-01-01', value: 100 },
      { date: '2025-01-02', value: 110 },
      { date: '2025-01-03', value: 121 }
    ]
    const right: Point[] = [
      { date: '2025-01-01', value: 100 },
      { date: '2025-01-03', value: 105 }
    ]

    const aligned = alignReturns(left, right)
    expect(aligned.dates).toEqual(['2025-01-03'])
    expect(aligned.left[0]).toBeCloseTo(0.21, 6)
    expect(aligned.right[0]).toBeCloseTo(0.05, 6)
  })

  it('returns nothing when the two share no dates', () => {
    const aligned = alignReturns(
      series(5, () => 0.01, '2025-01-01'),
      series(5, () => 0.01, '2030-01-01')
    )
    expect(aligned.dates).toEqual([])
  })
})

describe('correlation (BU-176)', () => {
  it('is 1 for a series against itself', () => {
    expect(correlation(WOBBLE, WOBBLE)).toBeCloseTo(1, 10)
  })

  it('is −1 against its mirror', () => {
    const mirror = series(300, (i) => -Math.sin(i / 3) / 100)
    expect(correlation(WOBBLE, mirror)).toBeCloseTo(-1, 6)
  })

  it('says nothing rather than zero when a series never moves', () => {
    // A flat line has no variance, so there is no correlation to report —
    // and 0.0 would read as "measured, and independent".
    const flat = series(300, () => 0)
    expect(correlation(WOBBLE, flat)).toBeUndefined()
  })

  it('needs more than a couple of observations', () => {
    expect(correlationOf([0.1, 0.2], [0.1, 0.2])).toBeUndefined()
    expect(correlationOf([0.1, 0.2, 0.3], [0.1, 0.2])).toBeUndefined()
  })
})

describe('rolling windows (BU-176)', () => {
  it('stamps each figure at the end of its own window', () => {
    // Not the middle and not the start: a value dated today must describe
    // days up to today, never days after it.
    const rolled = rollingVolatility(WOBBLE, 60)
    expect(rolled[0]?.date).toBe(WOBBLE[60]?.date)
    expect(rolled[rolled.length - 1]?.date).toBe(WOBBLE[WOBBLE.length - 1]?.date)
  })

  it('draws nothing until it has a full window', () => {
    expect(
      rollingVolatility(
        series(30, () => 0.01),
        60
      )
    ).toEqual([])
    expect(rollingCorrelation(WOBBLE, WOBBLE, 400)).toEqual([])
  })

  it('rolls a correlation of a series against itself at 1 throughout', () => {
    const rolled = rollingCorrelation(WOBBLE, WOBBLE, 60)
    expect(rolled.length).toBeGreaterThan(0)
    expect(rolled.every((point) => Math.abs(point.value - 1) < 1e-9)).toBe(true)
  })
})

describe('information ratio (BU-176)', () => {
  it('annualises both halves, so the ratio compares with a Sharpe', () => {
    const benchmark = series(300, (i) => Math.sin(i / 3) / 100 - 0.0001)
    const result = informationRatio(WOBBLE, benchmark)

    expect(result?.excess).toBeGreaterThan(0)
    expect(result?.trackingError).toBeGreaterThan(0)
    expect(result?.ratio).toBeGreaterThan(0)
  })

  it('has no ratio against itself, where there is no active risk', () => {
    // Zero tracking error: the division says nothing, so neither does this.
    const result = informationRatio(WOBBLE, WOBBLE)
    expect(result?.trackingError).toBeCloseTo(0, 10)
    expect(result?.ratio).toBeUndefined()
  })

  it('refuses a span too short to annualise from', () => {
    expect(
      informationRatio(
        series(10, () => 0.01),
        series(10, () => 0.02)
      )
    ).toBeUndefined()
  })
})
