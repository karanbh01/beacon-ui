import type { components } from '@shared/api.generated'
import type { FrontierDot, Marker } from '../../charts/FrontierChart'

export type FrontierPoint = components['schemas']['FrontierPoint']
export type FrontierView = components['schemas']['FrontierView']

export interface Plottable {
  points: FrontierDot[]
  /** Points the engine sent that have no height, so the pane can say so. */
  dropped: number
}

/**
 * Only the points that have both coordinates (BU-184).
 *
 * `expected_return` is nullable and not required. Substituting zero — which
 * this did — puts the point on the axis, and that is not "we do not know
 * this one" but "this portfolio returns nothing": a specific claim, made in
 * the view whose entire job is the shape of the curve.
 *
 * The asymmetry is why it matters more here than in a stat. A reader checks
 * a number and absorbs a shape, so a fabricated coordinate is absorbed
 * without ever being examined. Dropping the point loses information; drawing
 * it invents some, and the count says which happened.
 */
export function plottable(points: readonly FrontierPoint[]): Plottable {
  const drawn: FrontierDot[] = []

  for (const point of points) {
    if (point.expected_return == null) continue
    drawn.push({
      volatility: point.volatility,
      expectedReturn: point.expected_return,
      binding: point.binding ?? [],
      heuristic: point.heuristic
    })
  }

  return { points: drawn, dropped: points.length - drawn.length }
}

/**
 * The two named portfolios, where they can be drawn.
 *
 * Same rule as the grid: a marker with no expected return has no height.
 * Callers find the one they want BY LABEL rather than by position, since
 * either can be missing — indexing into a filtered list is how "tangency"
 * silently becomes "min var".
 */
export function markersFor(view: FrontierView | undefined): Marker[] {
  if (view === undefined) return []

  const named: [string, FrontierPoint][] = [
    ['min var', view.minimum_variance],
    ['tangency', view.tangency]
  ]

  return named
    .filter(([, portfolio]) => portfolio.expected_return != null)
    .map(([label, portfolio]) => ({
      label,
      volatility: portfolio.volatility,
      expectedReturn: portfolio.expected_return ?? 0
    }))
}

/** Every constraint that bound anywhere on the grid. */
export function boundAnywhere(points: readonly FrontierDot[]): Set<string> {
  return new Set(points.flatMap((point) => point.binding))
}
