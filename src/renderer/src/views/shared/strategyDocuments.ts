import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { components } from '@shared/api.generated'
import { keys } from '../../api/keys'
import { useBeacon } from '../../api/queryClient'
import { isDocumentId } from '../../api/ids'
import { workKey } from '../../api/work'
import type { Suggestion } from '../../components/TickerField/suggestions'
import { useBacktestRecords } from './beaconQueries'
import { withBacktests } from './indexSuggestions'
import type { Skipped } from './pickers'

export type StoredStrategy = components['schemas']['StoredStrategy']
export type StrategyDocument = components['schemas']['StrategyDocument']
export type StrategyBacktestRequest = components['schemas']['StrategyBacktestRequest']
export type BacktestOptions = components['schemas']['BacktestOptions']
export type IndexLevelView = components['schemas']['IndexLevelView']

/**
 * Stored strategies (py-beacon 0.9.0, BN-312, BU-233).
 *
 * A strategy is what to hold and how to trade it — the index it tracks or
 * is benchmarked against, the kind (the index as defined, tracking it, or
 * active against it), and its implementation. Designed in Strategy Builder
 * and kept in the engine's store like an index definition, so it travels
 * with the data; Beacon View backtests one and reads its latest run.
 */
export function useStrategies() {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.strategy.strategies(),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/strategies', { signal })
    },
    enabled: client !== null
  })
}

export function useStrategy(strategyId: string) {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.strategy.document(strategyId),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/strategies/{strategy_id}', {
        params: { strategy_id: strategyId },
        signal
      })
    },
    // The engine 422s an id it cannot address, as it does for an index.
    enabled: client !== null && isDocumentId(strategyId)
  })
}

export function useSaveStrategy() {
  const client = useBeacon()
  const queries = useQueryClient()

  return useMutation({
    mutationFn: ({ document, isNew }: { document: StrategyDocument; isNew: boolean }) => {
      if (client === null) throw new Error('No engine')
      return isNew
        ? client.write('post', '/strategies', { body: document })
        : client.write('put', '/strategies/{strategy_id}', {
            params: { strategy_id: document.id },
            body: document
          })
    },
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: keys.strategy.strategies() })
      void queries.invalidateQueries({ queryKey: ['strategy', 'document'] })
    }
  })
}

export function useValidateStrategy() {
  const client = useBeacon()

  return useMutation({
    mutationFn: (document: StrategyDocument) => {
      if (client === null) throw new Error('No engine')
      return client.write('post', '/strategies/validate', { body: document })
    }
  })
}

/** Deletes the strategy and every run of it, which the engine reports back. */
export function useDeleteStrategy() {
  const client = useBeacon()
  const queries = useQueryClient()

  return useMutation({
    mutationFn: (strategyId: string) => {
      if (client === null) throw new Error('No engine')
      return client.write('delete', '/strategies/{strategy_id}', {
        params: { strategy_id: strategyId }
      })
    },
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: keys.strategy.all() })
      void queries.invalidateQueries({ queryKey: keys.beacon.all() })
    }
  })
}

/**
 * The strategy catalogue as query-bar suggestions, saying which have a run.
 *
 * Beacon View's tabs name a strategy in their bar the way they named an index
 * until 0.9.0. Each row is named for the strategy and the index it holds, and
 * dated by its latest run, since a run is what every view there reads.
 */
export function useStrategyCatalogue(): {
  rows: Suggestion[]
  loading: boolean
  skipped: Skipped
} {
  const strategies = useStrategies()
  const runs = useBacktestRecords()

  const named = useMemo(
    () =>
      (strategies.data?.strategies ?? []).map((strategy) => ({
        identifier: strategy.id,
        name: `${strategy.name} · ${strategy.index_id}`
      })),
    [strategies.data]
  )
  const rows = useMemo(
    () => withBacktests(named, runs.data?.backtests ?? [], Date.now()),
    [named, runs.data]
  )

  return {
    rows,
    loading: strategies.isPending,
    skipped: {
      skipped: strategies.data?.skipped ?? 0,
      skipped_causes: strategies.data?.skipped_causes ?? null
    }
  }
}

/**
 * Backtest a stored strategy (BN-313): a `backtest:{strategy_id}` job, 202.
 *
 * The body holds what a strategy does not: the period, capital, costs,
 * currency, dividends, benchmark, assumptions, flows and vehicle.
 */
export function useRunStrategyBacktest() {
  const client = useBeacon()

  return useMutation({
    mutationKey: workKey('backtest'),
    mutationFn: ({ strategyId, body }: { strategyId: string; body: StrategyBacktestRequest }) => {
      if (client === null) throw new Error('No engine')
      return client.write('post', '/strategies/{strategy_id}/backtest', {
        params: { strategy_id: strategyId },
        body
      })
    }
  })
}

/** What a backtest would run, fully resolved, or the findings that stop it. */
export function useValidateStrategyBacktest() {
  const client = useBeacon()

  return useMutation({
    mutationFn: ({ strategyId, body }: { strategyId: string; body: StrategyBacktestRequest }) => {
      if (client === null) throw new Error('No engine')
      return client.write('post', '/strategies/{strategy_id}/backtest/validate', {
        params: { strategy_id: strategyId },
        body
      })
    }
  })
}

/**
 * Everything a strategy or a backtest can be made of (#285), with units and
 * bounds, the vehicle presets and the engine's default assumptions. No data
 * is needed to answer it, and it changes only with the engine.
 */
export function useBacktestOptions() {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.strategy.backtestOptions(),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/backtest/options', { signal })
    },
    enabled: client !== null,
    staleTime: Infinity
  })
}

/**
 * An index calculated on its own, with no backtest (BN-316): its level, its
 * headline figures and its weights at each rebalance.
 */
export function useIndexLevel(indexId: string, start = '', end = '') {
  const client = useBeacon()
  const query = { ...(start === '' ? {} : { start }), ...(end === '' ? {} : { end }) }

  return useQuery({
    queryKey: keys.beacon.indexLevel(indexId, start, end),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/indices/{index_id}/level', {
        params: { index_id: indexId },
        query,
        signal
      })
    },
    enabled: client !== null && isDocumentId(indexId)
  })
}
