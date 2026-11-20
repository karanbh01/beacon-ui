import type { components } from '@shared/api.generated'

type Step = components['schemas']['RebalanceStepPayload']
type Pricing = components['schemas']['RebalancePricingPayload']
type Unfilled = components['schemas']['UnfilledOrderPayload']
type Snapshot = components['schemas']['RebalanceSnapshot']

/** One rebalance as the implementation carried it out. */
export interface StepRow {
  date: string
  /** The session its trades were struck at, when not the scheduled day. */
  pricedFrom: string | undefined
  removed: number
  /** Which stages removed names, by label, most first: "3 Minimum price". */
  removedBy: string
  capped: number
  cashWeight: number
  unfilled: number
}

/**
 * The run's three per-rebalance records, joined by date.
 *
 * `rebalance_steps`, `rebalance_pricing` and `unfilled` each carry the
 * rebalance date and nothing else in common, and a reader asks of one
 * rebalance all three questions at once: what was taken out, what session
 * was it priced at, and did the orders fill.
 */
export function stepRows(
  steps: readonly Step[],
  pricing: readonly Pricing[],
  unfilled: readonly Unfilled[],
  labelOf: (stage: string) => string
): StepRow[] {
  const pricedFrom = new Map(pricing.map((row) => [row.date, row.priced_from]))
  const shortBy = countBy(unfilled.map((order) => order.date))

  return steps.map((step) => {
    const priced = pricedFrom.get(step.date)
    const removed = step.removed ?? {}
    const capped = step.capped ?? {}
    return {
      date: step.date,
      pricedFrom: priced === undefined || priced === step.date ? undefined : priced,
      removed: Object.keys(removed).length,
      removedBy: describeStages(Object.values(removed), labelOf),
      capped: Object.keys(capped).length,
      cashWeight: step.cash_weight,
      unfilled: shortBy.get(step.date) ?? 0
    }
  })
}

/** "3 Minimum price · 1 Exclusions", the stage that removed most first. */
function describeStages(stages: readonly string[], labelOf: (stage: string) => string): string {
  return [...countBy(stages)]
    .sort(([, a], [, b]) => b - a)
    .map(([stage, count]) => `${String(count)} ${labelOf(stage)}`)
    .join(' · ')
}

/** A name a screen took out at a rebalance, and the screen, by its label. */
export interface RemovedName {
  id: string
  screen: string
}

/** A name a cap cut down, from its weight in the index to the cap. */
export interface CappedName {
  id: string
  /** Its weight in the index's own composition then; undefined if it had none. */
  index: number | undefined
  capped: number
}

/**
 * What one rebalance took out and cut down, name by name (Karan,
 * 2026-11-20): removed by screen, then name; capped by how far the cap cut,
 * deepest first. The index's weight comes from its snapshot at that date,
 * which the implementation's stages start from.
 */
export function rebalanceNames(
  step: Step,
  snapshot: Snapshot | undefined,
  labelOf: (stage: string) => string
): { removed: RemovedName[]; capped: CappedName[] } {
  const removed = Object.entries(step.removed ?? {})
    .map(([id, stage]) => ({ id, screen: labelOf(stage) }))
    .sort((one, other) => one.screen.localeCompare(other.screen) || one.id.localeCompare(other.id))
  const capped = Object.entries(step.capped ?? {})
    .map(([id, weight]) => ({ id, index: snapshot?.weights[id], capped: weight }))
    .sort((one, other) => cut(other) - cut(one))
  return { removed, capped }
}

function cut(name: CappedName): number {
  return (name.index ?? name.capped) - name.capped
}

function countBy(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

/** The share of an order that filled, as a fraction; undefined for a zero order. */
export function fillRatio(order: Unfilled): number | undefined {
  if (order.requested_quantity === 0) return undefined
  return order.filled_quantity / order.requested_quantity
}

export function sum<T>(rows: readonly T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0)
}

/** A count of units or contracts, whole. */
export const quantity = (value: number): string =>
  value.toLocaleString('en-US', { maximumFractionDigits: 0 })
