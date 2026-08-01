import { describe, expect, it } from 'vitest'
import type { ExposuresView } from '../shared/optimiseQueries'
import { exposureRows, largestTilt } from './exposures'

function view(overrides: Partial<ExposuresView> = {}): ExposuresView {
  return {
    run_id: 'run-1',
    factors: ['Market Beta', 'Quality', 'Momentum'],
    r_squared: 0.87,
    // Deliberately in a different order from `factors`, and with one factor
    // absent from the benchmark list.
    optimal_exposures: [
      { factor: 'Quality', exposure: 0.34 },
      { factor: 'Market Beta', exposure: 1.02 },
      { factor: 'Momentum', exposure: -0.11 }
    ],
    index_exposures: [
      { factor: 'Market Beta', exposure: 1.0 },
      { factor: 'Quality', exposure: 0.05 }
    ],
    active_exposures: [
      { factor: 'Market Beta', exposure: 0.02 },
      { factor: 'Quality', exposure: 0.29 },
      { factor: 'Momentum', exposure: -0.11 }
    ],
    risk: {
      total_variance: 0.05,
      factor_variance: 0.034,
      specific_variance: 0.016,
      factor_share: 0.68,
      tracking_error: 0.018,
      residual: 0,
      reconciles: true,
      contributions: { 'Market Beta': 0.6, Quality: 0.5, Momentum: -0.1 }
    },
    ...overrides
  }
}

describe('exposureRows', () => {
  it('joins the three lists by factor NAME, not by position', () => {
    // The lists come back in different orders; pairing by index would put
    // Quality's portfolio exposure next to Market Beta's benchmark.
    const rows = exposureRows(view())
    const quality = rows.find((row) => row.factor === 'Quality')

    expect(quality?.portfolio).toBeCloseTo(0.34, 6)
    expect(quality?.benchmark).toBeCloseTo(0.05, 6)
  })

  it('treats a factor missing from a list as zero there', () => {
    const momentum = exposureRows(view()).find((row) => row.factor === 'Momentum')
    expect(momentum?.benchmark).toBe(0)
  })

  it('prefers the engine’s own active figure over a subtraction', () => {
    // The two sides may be estimated separately, in which case they net
    // differently from portfolio − benchmark.
    const rows = exposureRows(view())
    expect(rows.find((row) => row.factor === 'Quality')?.active).toBeCloseTo(0.29, 6)
  })

  it('falls back to the difference when no active figure was sent', () => {
    const rows = exposureRows(view({ active_exposures: [] }))
    expect(rows.find((row) => row.factor === 'Quality')?.active).toBeCloseTo(0.29, 6)
  })

  it('orders by the size of the tilt, either direction', () => {
    expect(exposureRows(view()).map((row) => row.factor)).toEqual([
      'Quality',
      'Momentum',
      'Market Beta'
    ])
  })
})

describe('largestTilt', () => {
  it('picks the biggest absolute tilt, not the biggest positive one', () => {
    const rows = exposureRows(view({ active_exposures: [{ factor: 'Momentum', exposure: -0.9 }] }))
    expect(largestTilt(rows)?.factor).toBe('Momentum')
  })

  it('says nothing about an empty model', () => {
    expect(largestTilt([])).toBeUndefined()
  })
})
