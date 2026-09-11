import { describe, expect, it } from 'vitest'
import {
  boundAnywhere,
  markersFor,
  plottable,
  type FrontierPoint,
  type FrontierView
} from './frontier'

const POINTS: FrontierPoint[] = [
  { volatility: 0.1, expected_return: 0.04, weights: {}, binding: ['MaxWeight'], heuristic: false },
  { volatility: 0.14, expected_return: null, weights: {}, binding: [], heuristic: false },
  { volatility: 0.18, expected_return: 0.09, weights: {}, binding: [], heuristic: true }
]

describe('plottable (BU-184)', () => {
  it('drops a point with no expected return rather than placing it at zero', () => {
    /*
     * Zero is not "unknown" on a return axis, it is "this portfolio returns
     * nothing" — a specific claim, in the view whose whole job is the shape
     * of the curve.
     */
    const { points } = plottable(POINTS)

    expect(points.map((point) => point.expectedReturn)).toEqual([0.04, 0.09])
    expect(points.some((point) => point.expectedReturn === 0)).toBe(false)
  })

  it('counts what it dropped, so the pane can say so', () => {
    // A curve missing a third of its grid looks like a curve.
    expect(plottable(POINTS).dropped).toBe(1)
    expect(plottable([]).dropped).toBe(0)
  })

  it('keeps a genuine zero return, which is a measurement', () => {
    const flat: FrontierPoint[] = [
      { volatility: 0.1, expected_return: 0, weights: {}, binding: [], heuristic: false }
    ]
    expect(plottable(flat).points).toHaveLength(1)
    expect(plottable(flat).dropped).toBe(0)
  })

  it('carries binding and heuristic through, which is what the dots mean', () => {
    const { points } = plottable(POINTS)
    expect(points[0]?.binding).toEqual(['MaxWeight'])
    expect(points[1]?.heuristic).toBe(true)
  })
})

describe('markersFor (BU-184)', () => {
  const view = {
    points: POINTS,
    minimum_variance: { volatility: 0.09, expected_return: 0.02, weights: {} },
    tangency: { volatility: 0.13, expected_return: 0.07, weights: {} },
    risk_free_rate: 0.04,
    monotonic: true
  } as FrontierView

  it('names both portfolios so a caller need not index into them', () => {
    expect(markersFor(view).map((marker) => marker.label)).toEqual(['min var', 'tangency'])
  })

  it('omits a portfolio with no expected return, and keeps the labels honest', () => {
    /*
     * The reason callers must look up by label: with min var dropped,
     * position 1 no longer exists and position 0 is the tangency. Indexing
     * is how "tangency" silently becomes "min var".
     */
    const partial = {
      ...view,
      minimum_variance: { ...view.minimum_variance, expected_return: null }
    } as FrontierView
    const markers = markersFor(partial)

    expect(markers).toHaveLength(1)
    expect(markers[0]?.label).toBe('tangency')
    expect(markers.find((marker) => marker.label === 'tangency')?.expectedReturn).toBeCloseTo(0.07)
  })

  it('has nothing to mark before the frontier arrives', () => {
    expect(markersFor(undefined)).toEqual([])
  })
})

describe('boundAnywhere', () => {
  it('collects every constraint that bound somewhere on the grid', () => {
    expect([...boundAnywhere(plottable(POINTS).points)]).toEqual(['MaxWeight'])
  })

  it('is empty when nothing bound, which is a real answer', () => {
    expect(boundAnywhere([]).size).toBe(0)
  })
})
