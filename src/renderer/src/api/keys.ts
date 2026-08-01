/**
 * Query key factory.
 *
 * Keys are structured `[domain, resource, subject, params]` so a whole
 * domain, a resource, or one subject can be invalidated without touching the
 * rest. That matters because freshness events arrive per DATASET, not per
 * request — a prices sync must drop every prices query for every ticker, and
 * leave reference data alone.
 *
 * `asof` is part of the key wherever a view can pin a date. Two views of the
 * same index at different as-of dates are different data, and sharing a cache
 * entry between them would show one view the other's numbers.
 */

export const keys = {
  health: () => ['health'] as const,

  data: {
    all: () => ['data'] as const,
    prices: (identifier: string, params?: Record<string, unknown>) =>
      ['data', 'prices', identifier, params ?? {}] as const,
    reference: (identifier: string) => ['data', 'reference', identifier] as const,
    corporateActions: (identifier: string, params?: Record<string, unknown>) =>
      ['data', 'corporate-actions', identifier, params ?? {}] as const,
    coverage: () => ['data', 'coverage'] as const,
    watchlists: () => ['data', 'watchlists'] as const
  },

  /**
   * Definitions the user authors, as opposed to market data they consume.
   *
   * Separate from `data` because nothing a market sync does can change an
   * index definition, and a freshness event must not drop a draft's preview
   * for a reason the user did not cause.
   */
  strategy: {
    all: () => ['strategy'] as const,
    indices: () => ['strategy', 'indices'] as const,
    index: (indexId: string) => ['strategy', 'index', indexId] as const,
    universes: () => ['strategy', 'universes'] as const,
    universeMembers: (universeId: string) => ['strategy', 'universe-members', universeId] as const
  },

  beacon: {
    all: () => ['beacon'] as const,
    overview: (indexId: string, asof?: string) => ['beacon', 'overview', indexId, asof] as const,
    weights: (indexId: string, asof?: string) => ['beacon', 'weights', indexId, asof] as const,
    attribution: (indexId: string, asof?: string) =>
      ['beacon', 'attribution', indexId, asof] as const
  },

  jobs: {
    all: () => ['jobs'] as const,
    one: (jobId: string) => ['jobs', jobId] as const
  }
} as const

/**
 * Which query prefixes a dataset's freshness event should invalidate.
 *
 * py-beacon names the dataset (`market`, and whatever coverage syncs), so the
 * mapping lives here rather than at the call site — otherwise every view would
 * have to know which datasets it depends on.
 */
export function invalidationsFor(dataset: string): readonly (readonly string[])[] {
  if (dataset === 'market') {
    // Prices, corporate actions and anything derived from them. Index views
    // are computed FROM market data, so they go stale too.
    return [keys.data.all(), keys.beacon.all(), keys.health()]
  }
  return [keys.data.all(), keys.health()]
}
