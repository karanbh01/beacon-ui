import { useQuery } from '@tanstack/react-query'
import type { components } from '@shared/api.generated'
import { ApiError } from '../../api/errors'
import { keys } from '../../api/keys'
import { useBeacon } from '../../api/queryClient'

export type OverviewView = components['schemas']['OverviewView']
export type WeightsView = components['schemas']['WeightsView']
export type AttributionView = components['schemas']['AttributionView']
export type AssetView = components['schemas']['AssetView']
export type CompareView = components['schemas']['CompareView']

/**
 * Reads of a stored strategy's latest run (py-beacon 0.9.0, BU-233).
 *
 * Every Beacon View answer is a run's: the overview's level is the run's
 * portfolio, the weights its rebalance snapshots. They were keyed by index
 * until 0.9.0, which kept one run per index, so two strategies on an index
 * overwrote each other. Now a run belongs to its strategy, and each of these
 * is asked of one.
 *
 * Distinct from `strategyQueries`, which edits documents: nothing here is a
 * draft, and everything is invalidated by a market sync rather than by a
 * save. The split keeps a freshness event from dropping an editor's state.
 */

/**
 * Every strategy's latest run, newest first (BN-313).
 *
 * Thin rows on purpose — the books stay behind `/strategies/{id}/record`.
 * Invalidated with the rest of the beacon branch, which is what a new run or
 * a deleted strategy already touches.
 */
export function useBacktestRecords() {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.beacon.backtests(),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/strategies/runs', { signal })
    },
    enabled: client !== null
  })
}

/**
 * The stored backtest for one index (BN-158, BU-169).
 *
 * What the engine kept from the last run: the portfolio's books, the index it
 * tracked, the comparator. A 404 is the ordinary answer for an index nobody
 * has back-tested, so it does not retry — the listing already said which
 * indices have one, and asking again cannot change that.
 */
/**
 * Absent, as opposed to broken (BU-177).
 *
 * A 404 means the engine has no record for this index, which is the
 * ordinary state of one nobody has back-tested. Anything else — a 500 on a
 * stored artefact the server cannot read, a dropped connection — is a
 * fault, and reporting it as "never back-tested" tells the reader something
 * true of the wrong thing. py-beacon's #187 is the engine half of exactly
 * this: a record the listing promises and the detail endpoint then fails on.
 */
export function isAbsent(error: unknown): boolean {
  return error instanceof ApiError && error.isNotFound
}

/**
 * `reference_fields` as the engine takes it (py-beacon 0.9.2, BN-325): the
 * reference columns a holding row should carry, comma-separated. Empty asks
 * for none, which is what a view that shows no holdings wants: on a long
 * history the columns are most of the payload.
 */
function referenceQuery(fields: readonly string[]): { reference_fields: string } {
  return { reference_fields: fields.join(',') }
}

export function useBacktestRecord(
  strategyId: string,
  enabled = true,
  referenceFields: readonly string[] = []
) {
  const client = useBeacon()

  return useQuery({
    queryKey: [...keys.beacon.record(strategyId), referenceFields.join(',')],
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/strategies/{strategy_id}/record', {
        params: { strategy_id: strategyId },
        query: referenceQuery(referenceFields),
        signal
      })
    },
    enabled: client !== null && strategyId !== '' && enabled,
    retry: false
  })
}

export function useOverview(strategyId: string) {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.beacon.overview(strategyId),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/strategies/{strategy_id}/overview', {
        params: { strategy_id: strategyId },
        signal
      })
    },
    enabled: client !== null && strategyId !== ''
  })
}

export function useWeights(
  strategyId: string,
  asof?: string,
  referenceFields: readonly string[] = []
) {
  const client = useBeacon()

  return useQuery({
    queryKey: [...keys.beacon.weights(strategyId, asof), referenceFields.join(',')],
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/strategies/{strategy_id}/weights', {
        params: { strategy_id: strategyId },
        query: {
          ...(asof === undefined || asof === '' ? {} : { asof }),
          ...referenceQuery(referenceFields)
        },
        signal
      })
    },
    enabled: client !== null && strategyId !== ''
  })
}

export type HoldingsView = components['schemas']['HoldingsView']

/**
 * A strategy's whole holdings workflow at a date (py-beacon 0.9.3, BN-326):
 * every universe name through the index's rules and cap, the benchmark's
 * weight, the strategy's, the implementation's stages, what the rebalance
 * traded to, the drift since and the shares held. Without a date, the run's
 * last day.
 */
export function useHoldings(
  strategyId: string,
  date = '',
  referenceFields: readonly string[] = [],
  /** Off until the reader runs it: Holdings Detail opens empty (Karan, 2026-10-19). */
  enabled = true
) {
  const client = useBeacon()

  return useQuery({
    queryKey: ['beacon', 'holdings', strategyId, date, referenceFields.join(',')],
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/strategies/{strategy_id}/holdings', {
        params: { strategy_id: strategyId },
        query: { ...(date === '' ? {} : { date }), ...referenceQuery(referenceFields) },
        signal
      })
    },
    enabled: client !== null && strategyId !== '' && enabled,
    retry: false
  })
}

export function useAttribution(
  strategyId: string,
  start?: string,
  end?: string,
  referenceFields: readonly string[] = []
) {
  const client = useBeacon()
  const query = {
    ...(start === undefined || start === '' ? {} : { start }),
    ...(end === undefined || end === '' ? {} : { end }),
    ...referenceQuery(referenceFields)
  }

  return useQuery({
    queryKey: [...keys.beacon.attribution(strategyId), query],
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/strategies/{strategy_id}/attribution', {
        params: { strategy_id: strategyId },
        query,
        signal
      })
    },
    enabled: client !== null && strategyId !== ''
  })
}

export function useAsset(strategyId: string, identifier: string) {
  const client = useBeacon()

  return useQuery({
    queryKey: ['beacon', 'asset', strategyId, identifier],
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/strategies/{strategy_id}/assets/{identifier}', {
        params: { strategy_id: strategyId, identifier },
        signal
      })
    },
    enabled: client !== null && strategyId !== '' && identifier !== ''
  })
}

/** Two or more strategies' latest runs on one rebased scale. */
export function useCompare(strategyIds: readonly string[]) {
  const client = useBeacon()
  const ids = [...strategyIds].filter((id) => id !== '')

  return useQuery({
    queryKey: ['beacon', 'compare', ids.join(',')],
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/strategies/compare', { query: { ids }, signal })
    },
    enabled: client !== null && ids.length >= 2
  })
}

export type RunResult = components['schemas']['BacktestRunResult']

/**
 * The latest run's whole payload (py-beacon 0.9.1, BN-320): NAV per unit,
 * units, flows, share classes, the implementation's stages, and the swap
 * and futures records — what the overview and record leave out. Kept with
 * the run, so it answers after an engine restart; 404 until there is one.
 */
export function useRunResult(strategyId: string, referenceFields: readonly string[] = []) {
  const client = useBeacon()

  return useQuery({
    queryKey: [...keys.beacon.result(strategyId), referenceFields.join(',')],
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/strategies/{strategy_id}/result', {
        params: { strategy_id: strategyId },
        query: referenceQuery(referenceFields),
        signal
      })
    },
    enabled: client !== null && strategyId !== '',
    retry: false
  })
}

export type PeriodsView = components['schemas']['PeriodsView']
export type ComparisonPayload = components['schemas']['ComparisonPayload']

/**
 * A run's figures by period (py-beacon 0.9.2, BN-324): the strategy's, and
 * its own and relative figures against each comparator, for each year,
 * quarter or month. Each period runs from the previous period's close, so
 * they compound to the since-inception figures; 404 until there is a run.
 */
export function usePeriods(strategyId: string, frequency: 'annual' | 'quarterly' | 'monthly') {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.beacon.periods(strategyId, frequency),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/strategies/{strategy_id}/periods', {
        params: { strategy_id: strategyId },
        query: { frequency },
        signal
      })
    },
    enabled: client !== null && strategyId !== '',
    retry: false
  })
}
