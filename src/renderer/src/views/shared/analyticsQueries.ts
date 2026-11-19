import { useQuery } from '@tanstack/react-query'
import { keys } from '../../api/keys'
import { useBeacon } from '../../api/queryClient'
import { tableRows } from '../../api/analytics'

/**
 * py-beacon 0.10.0's analytics (BN-398): the catalogue every report face is
 * drawn from, a strategy's latest run's statistics, and its large tables.
 */
export function useAnalysisOptions() {
  const client = useBeacon()
  return useQuery({
    queryKey: keys.beacon.analysisOptions(),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.analytics.options(signal)
    },
    enabled: client !== null,
    // The catalogue changes only with the engine, which restarts the app's queries.
    staleTime: Infinity
  })
}

export function useAnalytics(strategyId: string) {
  const client = useBeacon()
  return useQuery({
    queryKey: keys.beacon.analytics(strategyId),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.analytics.forStrategy(strategyId, signal)
    },
    enabled: client !== null && strategyId !== ''
  })
}

/** A run's large table, as rows (BN-398): the trades, fetched whole. */
export function useRunTable(strategyId: string, name: string) {
  const client = useBeacon()
  return useQuery({
    queryKey: keys.beacon.table(strategyId, name),
    queryFn: async ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return tableRows(await client.analytics.table(strategyId, name, signal))
    },
    enabled: client !== null && strategyId !== ''
  })
}
