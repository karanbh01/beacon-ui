import type { components } from '@shared/api.generated'

export type PreviewResponse = components['schemas']['PreviewResponse']
export type PreviewAsset = components['schemas']['PreviewAsset']
export type PreviewStep = components['schemas']['PreviewStep']

export interface WaterfallColumn {
  key: string
  /** "01 · Filter rule" — the position and what the rule was. */
  header: string
  position: number
}

/**
 * One column per rule, in pipeline order.
 *
 * Position 0 is the universe itself, which is the row count rather than a
 * test, so it gets no column — every asset in the table passed it by
 * definition.
 */
export function waterfallColumns(steps: readonly PreviewStep[]): WaterfallColumn[] {
  return steps
    .filter((step) => step.position > 0)
    .map((step) => ({
      key: step.rule_id ?? `step-${String(step.position)}`,
      header: `${String(step.position).padStart(2, '0')} · ${step.rule_type ?? 'rule'}`,
      position: step.position
    }))
}

export type CellState = 'pass' | 'cut' | 'gone'

/**
 * What an asset did at one step of the pipeline.
 *
 * Three states, not two: an asset that a later rule never saw is different
 * from one that saw it and failed. Figma draws the distinction as ✓ / ✕ / ·,
 * and collapsing it would make every excluded name look rejected by every
 * rule after the one that actually dropped it.
 */
export function cellState(asset: PreviewAsset, position: number): CellState {
  const at = asset.excluded_at
  if (at == null) return 'pass'
  if (at === position) return 'cut'
  return at < position ? 'gone' : 'pass'
}

export const CELL_GLYPH: Record<CellState, string> = {
  pass: '✓',
  cut: '✕',
  gone: '·'
}

/**
 * Heaviest first, and the excluded names after all of them.
 *
 * The engine sends rank order, which for a preview meant the table opened
 * on whatever the universe happened to list first. The portfolio is what a
 * reader came for, so the portfolio is at the top — and the names that
 * dropped out are still there, below the ones that did not.
 */
export function sortAssets(assets: readonly PreviewAsset[]): PreviewAsset[] {
  return [...assets].sort(
    (a, b) => Number(b.included) - Number(a.included) || weightOf(b) - weightOf(a)
  )
}

function weightOf(asset: PreviewAsset): number {
  return asset.weight ?? asset.solved_weight ?? 0
}

/**
 * Whether every included name carries the same weight (BU-186).
 *
 * py-beacon's `MarketCapWeighted` falls back to equal weights when it can
 * price nothing — total market cap of zero — and logs a warning nobody in
 * this app can see. So an index that says market-cap weighted and comes
 * back equally weighted is the fallback, and this is how it is spotted.
 *
 * Tolerant to a basis point, because the engine's arithmetic on a genuine
 * cap weighting will not produce exactly equal numbers and an exact
 * comparison would only ever fire on the fallback by luck.
 */
export function looksEquallyWeighted(assets: readonly PreviewAsset[]): boolean {
  const weights = assets.filter((asset) => asset.included).map(weightOf)
  if (weights.length < 2) return false

  const first = weights[0] ?? 0
  if (first <= 0) return false
  return weights.every((weight) => Math.abs(weight - first) < 0.0001)
}

export function percent(fraction: number | null | undefined, dp = 2): string {
  if (fraction === null || fraction === undefined) return '—'
  return `${(fraction * 100).toFixed(dp)}%`
}

/**
 * One-way turnover between two weightings.
 *
 * Half the sum of absolute weight changes: buying 1% of one name and selling
 * 1% of another is 1% of turnover, not 2%. Names in only one of the two
 * weightings count in full, which is what entering or leaving an index means.
 */
export function oneWayTurnover(
  before: Record<string, number>,
  after: Record<string, number>
): number {
  const names = new Set([...Object.keys(before), ...Object.keys(after)])
  let total = 0
  for (const name of names) {
    total += Math.abs((after[name] ?? 0) - (before[name] ?? 0))
  }
  return total / 2
}

export interface PreviewSummary {
  constituents: number
  totalWeight: number
  capped: number
  cap: number | null
  redistributed: number
}

export function summarise(preview: PreviewResponse): PreviewSummary {
  return {
    constituents: preview.assets.filter((asset) => asset.included).length,
    totalWeight: preview.total_weight,
    capped: preview.assets.filter((asset) => asset.capped).length,
    cap: preview.cap ?? null,
    redistributed: preview.cap_redistributed
  }
}

export type PreviewSolve = components['schemas']['PreviewSolve']
export type PreviewConstraint = components['schemas']['PreviewConstraint']

/**
 * The solve, if this preview describes one (BN-170).
 *
 * `solve` is the discriminator between the two faces of a preview, and it is
 * the same one the document already branches on a level up: a derivation
 * previews as a solve, a pipeline as a waterfall. Reading it rather than
 * testing `steps` for null keeps the branch on the field that is present when
 * the face is, rather than on the field that is absent.
 */
export function solveOf(preview: PreviewResponse): PreviewSolve | undefined {
  return preview.solve ?? undefined
}

/**
 * The reallocation, biggest move first.
 *
 * A solve moves every weight at once, so rank order says nothing about what
 * happened — the reader's question is "what did the optimiser change", and
 * the answer is the top of this list. Names the parent held and the solve
 * dropped move furthest and sort first, which is right: leaving the index is
 * the largest change there is.
 */
export function solveRows(assets: readonly PreviewAsset[]): PreviewAsset[] {
  return [...assets].sort((a, b) => Math.abs(delta(b)) - Math.abs(delta(a)))
}

function delta(asset: PreviewAsset): number {
  return asset.weight_delta ?? (asset.solved_weight ?? 0) - (asset.source_weight ?? 0)
}

/**
 * How much room a constraint had left, in its own unit.
 *
 * Formatted per row rather than per table: a weight cap's slack is a fraction
 * of the portfolio, a name-count limit's is a whole number of names, and an
 * expected-return target's is in return — so a single "% of weight" caption
 * over the column would be wrong for two of the three. py-beacon publishes
 * the unit on the row for exactly this reason (BN-170).
 *
 * A binding constraint has zero slack by definition, so it reports as bound
 * rather than as "0.00%" — the zero is the definition restated, not a
 * measurement, and a column of zeros reads as missing data.
 */
export function describeRoom(constraint: PreviewConstraint): string {
  if (constraint.binding) return 'bound'
  if (constraint.unit === 'fraction') return percent(constraint.slack)
  if (constraint.unit === 'count')
    return `${Math.round(constraint.slack).toLocaleString('en-US')} names`

  // An engine that adds a third unit gets its number and its own word for it,
  // rather than a figure silently formatted as one of the two units we know.
  return `${String(constraint.slack)} ${constraint.unit}`
}

export interface SolveSummary {
  constituents: number
  totalWeight: number
  /** How far the solve moved from the parent's published weights. */
  turnover: number
  binding: number
  constraints: number
}

export function summariseSolve(preview: PreviewResponse, solve: PreviewSolve): SolveSummary {
  const source: Record<string, number> = {}
  const solved: Record<string, number> = {}
  for (const asset of preview.assets) {
    if (asset.source_weight != null) source[asset.identifier] = asset.source_weight
    if (asset.solved_weight != null) solved[asset.identifier] = asset.solved_weight
  }

  return {
    constituents: preview.assets.filter((asset) => asset.included).length,
    totalWeight: preview.total_weight,
    turnover: oneWayTurnover(source, solved),
    binding: (solve.binding ?? []).length,
    constraints: (solve.constraints ?? []).length
  }
}

export type DatasetCoverage = components['schemas']['DatasetCoverage']

/**
 * Why a market-cap weighting came back equally weighted (BU-187).
 *
 * py-beacon's `MarketCapWeighted` prices a name with
 * `fetch_market_data(ticker, date, date)` — the EXACT date, no lookback. A
 * date the market frame has no bar for prices nothing, the total cap is
 * zero, and it assigns equal weights while logging server-side.
 *
 * The preview's own cap columns do not fall over the same way, because
 * `server/reference.py` looks back thirty days and takes the last print on
 * or before the date. That asymmetry is why the table can show healthy
 * market caps beside weights that never used them — and why "the caps are
 * empty" was the wrong thing to tell a reader to check.
 *
 * So the question is whether the chosen date is one the market data
 * actually covers, which `/data/coverage` answers per dataset.
 */
export function explainEqualWeights(
  asOf: string,
  market: DatasetCoverage | undefined
): string | undefined {
  const end = market?.end?.slice(0, 10)
  if (end !== undefined && asOf > end) {
    return `market data ends ${end}, so there is no price on ${asOf} to weight by`
  }

  const start = market?.start?.slice(0, 10)
  if (start !== undefined && asOf < start) {
    return `market data starts ${start}, so there is no price on ${asOf} to weight by`
  }

  // Inside the range and still unpriced: a weekend, a holiday, or a gap.
  // Naming the mechanism beats guessing which, and the reader can try a
  // neighbouring date to find out.
  return `no market bar on ${asOf} exactly — the weighting needs one, and does not look back`
}

/** The market dataset, which is the one a cap weighting reads. */
export function marketCoverage(
  datasets: readonly DatasetCoverage[] | undefined
): DatasetCoverage | undefined {
  return datasets?.find((dataset) => dataset.dataset === 'market')
}
