import { useQuery } from '@tanstack/react-query'
import type { components } from '@shared/api.generated'
import { keys } from '../../api/keys'
import { useBeacon } from '../../api/queryClient'

export type OverviewView = components['schemas']['OverviewView']
export type WeightsView = components['schemas']['WeightsView']
export type AttributionView = components['schemas']['AttributionView']
export type AssetView = components['schemas']['AssetView']
export type CompareView = components['schemas']['CompareView']

/**
 * Reads of a published index.
 *
 * Distinct from `strategyQueries`, which edits definitions: nothing here is
 * a draft, and everything is invalidated by a market sync rather than by a
 * save. The split keeps a freshness event from dropping an editor's state.
 */

export function useOverview(indexId: string) {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.beacon.overview(indexId),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/beacon/{index_id}/overview', { params: { index_id: indexId }, signal })
    },
    enabled: client !== null && indexId !== ''
  })
}

export function useWeights(indexId: string, asof?: string) {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.beacon.weights(indexId, asof),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/beacon/{index_id}/weights', {
        params: { index_id: indexId },
        query: asof === undefined || asof === '' ? {} : { asof },
        signal
      })
    },
    enabled: client !== null && indexId !== ''
  })
}

export function useAttribution(indexId: string, start?: string, end?: string) {
  const client = useBeacon()
  const query = {
    ...(start === undefined || start === '' ? {} : { start }),
    ...(end === undefined || end === '' ? {} : { end })
  }

  return useQuery({
    queryKey: [...keys.beacon.attribution(indexId), query],
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/beacon/{index_id}/attribution', {
        params: { index_id: indexId },
        query,
        signal
      })
    },
    enabled: client !== null && indexId !== ''
  })
}

export function useAsset(indexId: string, identifier: string) {
  const client = useBeacon()

  return useQuery({
    queryKey: ['beacon', 'asset', indexId, identifier],
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/beacon/{index_id}/assets/{identifier}', {
        params: { index_id: indexId, identifier },
        signal
      })
    },
    enabled: client !== null && indexId !== '' && identifier !== ''
  })
}

/** Two or more stored indices on one rebased scale. */
export function useCompare(indexIds: readonly string[]) {
  const client = useBeacon()
  const ids = [...indexIds].filter((id) => id !== '')

  return useQuery({
    queryKey: ['beacon', 'compare', ids.join(',')],
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/beacon/compare', { query: { ids }, signal })
    },
    enabled: client !== null && ids.length >= 2
  })
}
