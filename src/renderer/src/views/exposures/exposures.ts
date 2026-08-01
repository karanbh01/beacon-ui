import type { ExposuresView } from '../shared/optimiseQueries'

export interface ExposureRow {
  factor: string
  portfolio: number
  benchmark: number
  active: number
}

/**
 * One row per factor, ordered by the size of the active tilt.
 *
 * The three exposure lists come back separately and are keyed by factor name
 * rather than aligned by position, so they are joined by name — a factor
 * missing from one list is zero there, not silently paired with a neighbour.
 */
export function exposureRows(view: ExposuresView): ExposureRow[] {
  const portfolio = new Map(view.optimal_exposures.map((row) => [row.factor, row.exposure]))
  const benchmark = new Map(view.index_exposures.map((row) => [row.factor, row.exposure]))
  const active = new Map(view.active_exposures.map((row) => [row.factor, row.exposure]))

  return view.factors
    .map((factor) => ({
      factor,
      portfolio: portfolio.get(factor) ?? 0,
      benchmark: benchmark.get(factor) ?? 0,
      // Prefer the engine's own active figure: it may net differently from a
      // naive subtraction if the two sides were estimated separately.
      active: active.get(factor) ?? (portfolio.get(factor) ?? 0) - (benchmark.get(factor) ?? 0)
    }))
    .sort((a, b) => Math.abs(b.active) - Math.abs(a.active))
}

/** The factor the portfolio leans on hardest, either way. */
export function largestTilt(rows: readonly ExposureRow[]): ExposureRow | undefined {
  return rows.reduce<ExposureRow | undefined>(
    (worst, row) =>
      worst === undefined || Math.abs(row.active) > Math.abs(worst.active) ? row : worst,
    undefined
  )
}
