import type { components } from '@shared/api.generated'

type Step = components['schemas']['RebalanceStepPayload']
type Pricing = components['schemas']['RebalancePricingPayload']
type Unfilled = components['schemas']['UnfilledOrderPayload']

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
