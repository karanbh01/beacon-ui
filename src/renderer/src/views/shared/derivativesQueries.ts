import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { components } from '@shared/api.generated'
import { useBeacon } from '../../api/queryClient'

export type FuturesPriceRequest = components['schemas']['FuturesPriceRequest']
export type FuturesPriceResponse = components['schemas']['FuturesPriceResponse']
export type TrsPriceRequest = components['schemas']['TrsPriceRequest']
export type TrsPriceResponse = components['schemas']['TrsPriceResponse']
export type TermStructureResponse = components['schemas']['TermStructureResponse']
export type RollResponse = components['schemas']['RollResponse']

/** How long the pricer waits after the last keystroke before repricing. */
export const REPRICE_DELAY_MS = 250

/**
 * Hold a value still until the user stops changing it.
 *
 * A pricer reprices on every input, and typing "212.50" would otherwise send
 * five requests for prices nobody asked about. 250 ms is short enough that
 * the result still feels immediate and long enough to collapse a number.
 */
export function useDebounced<T>(value: T, delay = REPRICE_DELAY_MS): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value)
    }, delay)
    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return settled
}

/**
 * Price a future.
 *
 * A query rather than a mutation, deliberately: the request IS the cache key,
 * so returning to a set of inputs shows its answer instantly, and nothing
 * about pricing changes state on the server. `placeholderData` keeps the last
 * answer on screen while the next one is in flight, so the numbers update
 * rather than blinking through an empty state on every keystroke.
 */
export function useFuturesPrice(request: FuturesPriceRequest, enabled: boolean) {
  const client = useBeacon()

  return useQuery({
    queryKey: ['derivatives', 'futures', request],
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.write('post', '/derivatives/futures/price', { body: request, signal })
    },
    enabled: client !== null && enabled,
    placeholderData: (previous) => previous
  })
}

export function useTrsPrice(request: TrsPriceRequest, enabled: boolean) {
  const client = useBeacon()

  return useQuery({
    queryKey: ['derivatives', 'trs', request],
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.write('post', '/derivatives/trs/price', { body: request, signal })
    },
    enabled: client !== null && enabled,
    placeholderData: (previous) => previous
  })
}

export interface CurveOptions {
  expiries: readonly string[]
  riskFreeRate: number
  dividendYield: number
}

/**
 * The futures curve for a named set of contracts.
 *
 * `expiries` is required by py-beacon, not optional: the endpoint prices
 * contracts, and there is no "the curve" without saying which ones. Asking
 * with an empty list is a 422, so the query stays disabled until there is at
 * least one.
 */
export function useTermStructure(indexId: string, options: CurveOptions) {
  const client = useBeacon()
  const expiries = [...options.expiries]

  return useQuery({
    queryKey: [
      'derivatives',
      'term-structure',
      indexId,
      expiries.join(','),
      options.riskFreeRate,
      options.dividendYield
    ],
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/derivatives/{index_id}/term-structure', {
        params: { index_id: indexId },
        query: {
          expiries,
          risk_free_rate: options.riskFreeRate,
          dividend_yield: options.dividendYield
        },
        signal
      })
    },
    enabled: client !== null && indexId !== '' && expiries.length > 0
  })
}

/** The roll between two named contracts — again, both are required. */
export function useRoll(indexId: string, options: CurveOptions) {
  const client = useBeacon()
  const front = options.expiries[0]
  const back = options.expiries[1]

  return useQuery({
    queryKey: ['derivatives', 'roll', indexId, front, back, options.riskFreeRate],
    queryFn: ({ signal }) => {
      if (client === null || front === undefined || back === undefined) {
        throw new Error('No engine')
      }
      return client.get('/derivatives/{index_id}/roll', {
        params: { index_id: indexId },
        query: {
          front_expiry: front,
          back_expiry: back,
          risk_free_rate: options.riskFreeRate,
          dividend_yield: options.dividendYield
        },
        signal
      })
    },
    enabled: client !== null && indexId !== '' && front !== undefined && back !== undefined
  })
}
