import type { components } from '@shared/api.generated'

export type AttributionView = components['schemas']['AttributionView']
export type ContributionPayload = components['schemas']['ContributionPayload']

export interface AttributionRow {
  ticker: string
  averageWeight: number
  assetReturn: number
  contribution: number
  /** This name's share of the index's total return, as a percentage. */
  shareOfTotal: number | undefined
  /** 0–1 against the largest absolute contribution, for the inline bar. */
  magnitude: number
}

/**
 * Contributions as table rows, largest contribution first.
 *
 * `% of total` is a share of the index's return, so it is only meaningful
 * when there is a return to share out. A flat index would otherwise divide by
 * zero and every row would read as infinitely important.
 */
export function attributionRows(view: AttributionView): AttributionRow[] {
  const sorted = [...view.contributions].sort((a, b) => b.contribution - a.contribution)
  const largest = Math.max(...sorted.map((row) => Math.abs(row.contribution)), 0)

  return sorted.map((row) => ({
    ticker: row.asset_id,
    averageWeight: row.average_weight,
    assetReturn: row.total_return,
    contribution: row.contribution,
    shareOfTotal:
      view.total_return === 0 ? undefined : (row.contribution / view.total_return) * 100,
    magnitude: largest === 0 ? 0 : Math.abs(row.contribution) / largest
  }))
}

/**
 * Whether the parts add up to the whole.
 *
 * py-beacon publishes `reconciles` and `residual`, and BU-29 requires the
 * pane to REFUSE non-reconciling data rather than render it. An attribution
 * that does not reconcile is not a slightly-wrong attribution — it is a
 * different decomposition from the one the total claims, and showing it would
 * invite someone to quote a contribution that does not belong to that return.
 */
export function reconciles(view: AttributionView): boolean {
  return view.reconciles
}

/** The gap between the sum of contributions and the reported total return. */
export function residualPercent(view: AttributionView): number {
  return view.residual * 100
}

/**
 * The dev-mode warning BU-29 asks for.
 *
 * Console only, and only in dev: in a packaged build the user can do nothing
 * about it, and the pane already tells them the figures are withheld. Locally
 * it is the fastest signal that the engine's decomposition has drifted.
 */
export function warnIfUnreconciled(view: AttributionView, isDev: boolean): string | undefined {
  if (view.reconciles) return undefined

  const message =
    `[attribution] ${view.index_id} does not reconcile: contributions leave a residual of ` +
    `${residualPercent(view).toFixed(4)}% against a total return of ` +
    `${(view.total_return * 100).toFixed(4)}%. The pane is withholding the table.`

  if (isDev) console.warn(message)
  return message
}
