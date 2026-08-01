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

/** Included first, then the order the engine sent — which is rank order. */
export function sortAssets(assets: readonly PreviewAsset[]): PreviewAsset[] {
  return [...assets].sort((a, b) => Number(b.included) - Number(a.included))
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
