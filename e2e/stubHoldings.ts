/**
 * A strategy's holdings workflow at a date, as py-beacon 0.9.3 serves it
 * (BN-326, `GET /strategies/{id}/holdings`).
 *
 * The same fixture the stub's preview walks and its weights view holds:
 * fourteen universe names, four dropped by the index's rules, ten weighted
 * and two of those capped. The implementation then drops one more on a
 * minimum price, keeps two per cent in cash and caps capacity, so every
 * kind of stage has something to show. Fractions throughout.
 */

/** One name as the stub's weights view holds it. */
export interface HeldName {
  identifier: string
  weight: number
  raw_weight: number
  delta_since_rebalance: number
  shares_outstanding: number
}

interface Stage {
  key: string
  label: string
  kind: string
  remaining: number
}

/**
 * What each stage is and does, as beacon-ui asked py-beacon 0.9.3 to send
 * it (2026-10-19): its type, a sentence on what it does with its settings,
 * and the settings as a reader would see them. Keyed by stage key, which
 * for an index rule is the rule's id, so the preview's steps read it too.
 */
export const STAGE_DETAIL: Readonly<
  Record<string, { type: string; description: string; params: { label: string; value: string }[] }>
> = {
  universe: {
    type: 'Universe',
    description: 'Starts from the 120 names in the US Large Cap universe.',
    params: [
      { label: 'Universe', value: 'US Large Cap' },
      { label: 'Universe id', value: 'US-LARGECAP' }
    ]
  },
  'rule-1': {
    type: 'FilterRule',
    description: 'Keeps names in the Information Technology sector.',
    params: [{ label: 'Sector', value: 'Information Technology' }]
  },
  'rule-2': {
    type: 'FilterRule',
    description: 'Keeps names whose free-float market cap is at least 50bn USD.',
    params: [{ label: 'Minimum free-float market cap', value: '50,000,000,000 USD' }]
  },
  'rule-3': {
    type: 'RankRule',
    description: 'Ranks names by free-float market cap, largest first.',
    params: [
      { label: 'Ranked by', value: 'Free-float market cap' },
      { label: 'Order', value: 'Largest first' }
    ]
  },
  'rule-4': {
    type: 'SelectionRule',
    description: 'Keeps the ten highest-ranked names.',
    params: [{ label: 'Keep', value: 'Top 10' }]
  },
  'index-cap': {
    type: 'IndexCap',
    description: 'Caps each name at 12% of the index and spreads the excess across the rest.',
    params: [{ label: 'Maximum weight', value: '12%' }]
  },
  'stale-price': {
    type: 'StalePrice',
    description: 'Drops names with no fresh price on the rebalance date.',
    params: []
  },
  'minimum-price': {
    type: 'MinimumPriceScreen',
    description: 'Drops names priced below 5 USD.',
    params: [{ label: 'Minimum price', value: '5.00 USD' }]
  },
  'cash-buffer': {
    type: 'CashBuffer',
    description: 'Keeps 2% of the book in cash and scales every other weight down to match.',
    params: [{ label: 'Cash buffer', value: '2%' }]
  },
  'capacity-caps': {
    type: 'CapacityCaps',
    description:
      'Cuts each position to at most 10% of the book and spreads what it moves across the rest.',
    params: [
      { label: 'Maximum position', value: '10%' },
      { label: 'Smallest weight', value: '0.1%' }
    ]
  },
  strategy: {
    type: 'MinimumVariance',
    description: 'Builds its own weights by minimum variance, measured against the index.',
    params: [{ label: 'Lookback days', value: '252 days' }]
  }
}

export interface HoldingsRequest {
  strategyId: string
  indexId: string
  /** The strategy's type: `index`, `index_tracking` or `active`. */
  kind: string
  asOf: string
  rebalanceDate: string
  rebalanceDates: readonly string[]
  held: readonly HeldName[]
  /** The run's benchmark index's weights by name, or null without one. */
  benchmark: Readonly<Record<string, number>> | null
  referenceOf: (identifier: string) => Record<string, unknown> | null
  /** A name's free-float market cap on the day, for its universe weight. */
  capOf: (identifier: string) => number | null
}

/** The universe: every name the reference data lists, 120 of them. */
export const UNIVERSE = Array.from({ length: 120 }, (_, i) => `CMP${String(i).padStart(3, '0')}`)

/**
 * Which index rule drops each universe name the index does not hold, and at
 * which position. The whole universe, as the engine lists it (one row per
 * universe member, kept or not), so a count of dropped names matches the
 * rows a table shows. The first rule takes most; the second the rest.
 */
export function universeCuts(
  held: readonly string[]
): { identifier: string; rule: string; position: number }[] {
  return UNIVERSE.filter((identifier) => !held.includes(identifier)).map((identifier) => {
    const number = Number(identifier.slice(3))
    const second = number === 12 || number >= 80
    return second
      ? { identifier, rule: 'rule-2', position: 2 }
      : { identifier, rule: 'rule-1', position: 1 }
  })
}

/** The held name the minimum-price screen removes. */
const BELOW_MINIMUM = 'CMP009'

const CASH_BUFFER = 0.02

const round = (value: number): number => Number(value.toFixed(6))

export function holdingsView(request: HoldingsRequest): Record<string, unknown> {
  const settled = request.asOf.slice(0, 10) === request.rebalanceDate
  const cuts = universeCuts(request.held.map((name) => name.identifier))
  const stages = stagesFor(request.kind, request.held.length, cuts)
  const kept = request.held.filter((name) => name.identifier !== BELOW_MINIMUM)
  // Each universe name's share of the universe's free-float cap (0.9.3).
  const universe = [
    ...request.held.map((name) => name.identifier),
    ...cuts.map((cut) => cut.identifier)
  ]
  const universeCap = universe.reduce(
    (sum, identifier) => sum + (request.capOf(identifier) ?? 0),
    0
  )
  const universeWeight = (identifier: string): number | null => {
    const cap = request.capOf(identifier)
    return cap === null || universeCap === 0 ? null : round(cap / universeCap)
  }
  const keptWeight = kept.reduce((sum, name) => sum + strategyWeight(request, name), 0)

  const heldRows = request.held.map((name) => {
    const chosen = strategyWeight(request, name)
    const removed = name.identifier === BELOW_MINIMUM
    // What the minimum price removed is shared out among the rest, then the
    // buffer takes its cash off the top.
    const screened = removed ? null : round(chosen / keptWeight)
    const portfolio = screened === null ? null : round(screened * (1 - CASH_BUFFER))
    const drift = portfolio === null || settled ? null : round(name.delta_since_rebalance)
    const current = portfolio === null ? null : round(portfolio + (drift ?? 0))

    return {
      identifier: name.identifier,
      reference: request.referenceOf(name.identifier),
      excluded_at: removed ? 'minimum-price' : null,
      universe_weight: universeWeight(name.identifier),
      index_weight_uncapped: name.raw_weight,
      index_weight: name.weight,
      benchmark_weight: request.benchmark?.[name.identifier] ?? null,
      strategy_weight: chosen,
      implementation: {
        'stale-price': chosen,
        'minimum-price': screened,
        'cash-buffer': portfolio,
        'capacity-caps': portfolio
      },
      portfolio_weight: portfolio,
      weight_drift: drift,
      current_weight: current,
      shares_held: portfolio === null ? null : Math.round(portfolio * 41_000_000)
    }
  })

  const droppedRows = cuts.map(({ identifier, rule }) => ({
    identifier,
    reference: request.referenceOf(identifier),
    excluded_at: rule,
    universe_weight: universeWeight(identifier),
    index_weight_uncapped: null,
    index_weight: null,
    benchmark_weight: request.benchmark?.[identifier] ?? null,
    strategy_weight: null,
    implementation: Object.fromEntries(
      stages.filter((each) => isImplementation(each.kind)).map((each) => [each.key, null])
    ),
    portfolio_weight: null,
    weight_drift: null,
    current_weight: null,
    shares_held: null
  }))

  return {
    strategy_id: request.strategyId,
    index_id: request.indexId,
    as_of: request.asOf.slice(0, 10),
    rebalance_date: request.rebalanceDate,
    rebalance_dates: [...request.rebalanceDates],
    stages: stages.map((stage) => ({ ...stage, ...STAGE_DETAIL[stage.key] })),
    rows: [...heldRows, ...droppedRows],
    cash_weight: CASH_BUFFER
  }
}

/** The stages in the engine's order, with the names left after each. */
function stagesFor(kind: string, held: number, cuts: readonly { rule: string }[]): Stage[] {
  const total = held + cuts.length
  const afterFirst = total - cuts.filter((cut) => cut.rule === 'rule-1').length
  const strategy =
    kind === 'index'
      ? []
      : [
          {
            key: 'strategy',
            label: kind === 'active' ? 'Minimum variance' : 'Sampled replication',
            kind: 'strategy',
            remaining: held
          }
        ]
  return [
    { key: 'universe', label: 'Universe', kind: 'universe', remaining: total },
    { key: 'rule-1', label: 'Filter', kind: 'index_rule', remaining: afterFirst },
    { key: 'rule-2', label: 'Filter', kind: 'index_rule', remaining: held },
    { key: 'rule-3', label: 'Rank', kind: 'index_rule', remaining: held },
    { key: 'rule-4', label: 'Selection', kind: 'index_rule', remaining: held },
    { key: 'index-cap', label: 'Index cap', kind: 'index_cap', remaining: held },
    ...strategy,
    { key: 'stale-price', label: 'Stale price', kind: 'implementation_screen', remaining: held },
    {
      key: 'minimum-price',
      label: 'Minimum price',
      kind: 'implementation_screen',
      remaining: held - 1
    },
    { key: 'cash-buffer', label: 'Cash buffer', kind: 'cash_buffer', remaining: held - 1 },
    {
      key: 'capacity-caps',
      label: 'Capacity caps',
      kind: 'implementation_cap',
      remaining: held - 1
    }
  ]
}

function isImplementation(kind: string): boolean {
  return ['implementation_screen', 'cash_buffer', 'implementation_cap'].includes(kind)
}

/**
 * What the strategy chose before the implementation: the index weight for a
 * plain index strategy, tilted for a tracking or active one.
 */
function strategyWeight(request: HoldingsRequest, name: HeldName): number {
  if (request.kind === 'index') return name.weight
  const position = request.held.indexOf(name)
  const tilts = request.held.map((each, at) => each.weight * (1 + 0.15 * Math.sin(at + 1)))
  const total = tilts.reduce((sum, value) => sum + value, 0)
  return round((tilts[position] ?? 0) / total)
}
