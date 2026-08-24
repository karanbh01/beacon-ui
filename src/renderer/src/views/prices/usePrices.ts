import { useQuery } from '@tanstack/react-query'
import { keys } from '../../api/keys'
import { useBeacon } from '../../api/queryClient'

export type Range = '1M' | '3M' | '6M' | '1Y' | '5Y' | 'MAX'

export const RANGES: readonly { value: Range; label: string }[] = [
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
  { value: '5Y', label: '5Y' },
  { value: 'MAX', label: 'MAX' }
]

const MONTHS: Record<Exclude<Range, 'MAX'>, number> = {
  '1M': 1,
  '3M': 3,
  '6M': 6,
  '1Y': 12,
  '5Y': 60
}

/** ISO date `n` months before `now`, or undefined for MAX. */
export function rangeStart(range: Range, now = new Date()): string | undefined {
  if (range === 'MAX') return undefined
  const start = new Date(now)
  start.setMonth(start.getMonth() - MONTHS[range])
  return start.toISOString().slice(0, 10)
}

/**
 * How the engine buckets the series. Its own words, from the `interval`
 * parameter: "native, weekly or monthly." Native is whatever the dataset
 * holds — daily for a daily dataset — which is why the control says so
 * rather than promising "Daily" for data that might not be.
 */
export type Interval = 'native' | 'weekly' | 'monthly'

export const INTERVALS: readonly { value: Interval; label: string }[] = [
  { value: 'native', label: 'Native' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }
]

export interface PricesParams {
  start?: string | undefined
  end?: string | undefined
  interval?: Interval | undefined
}

export function usePrices(identifier: string, params: PricesParams = {}) {
  const client = useBeacon()
  const query = {
    ...(params.start === undefined ? {} : { start: params.start }),
    ...(params.end === undefined ? {} : { end: params.end }),
    // Omitted rather than sent as 'native', which is the server's default —
    // sending it would key a second cache entry for the same answer.
    ...(params.interval === undefined || params.interval === 'native'
      ? {}
      : { interval: params.interval })
  }

  return useQuery({
    queryKey: keys.data.prices(identifier, query),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.data.prices(identifier, query, signal)
    },
    // No client means no engine — BU-19 is still starting or the server died.
    // Firing anyway would just produce a confusing error under a loading
    // state that is really "waiting for the engine".
    enabled: client !== null && identifier !== ''
  })
}
