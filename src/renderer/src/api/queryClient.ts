import { createContext, useContext } from 'react'
import { QueryClient } from '@tanstack/react-query'
import type { BeaconClient } from './client'
import { ApiError } from './errors'

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data changes when py-beacon says it does, via freshness events —
        // not on a timer. Polling would be both slower to notice a sync and
        // wasteful when nothing has changed.
        staleTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // A 4xx fails identically however many times it is retried; only a
          // transport failure is worth another attempt.
          if (error instanceof ApiError) return false
          return failureCount < 2
        }
      }
    }
  })
}

export const ClientContext = createContext<BeaconClient | null>(null)

/** Whether the engine is still reading its store (BN-335); false when unknown. */
export const DataLoadingContext = createContext(false)

/**
 * True while the engine is up but still loading its data, when every data
 * request answers NO_DATA_LOADED. A view says it is on its way rather than
 * that there is none.
 */
export function useDataLoading(): boolean {
  return useContext(DataLoadingContext)
}

/**
 * The API client for the currently connected engine.
 *
 * Null while the engine is starting or down. Views must handle that rather
 * than assume a client — the engine can die at any moment (BU-19).
 */
export function useBeacon(): BeaconClient | null {
  return useContext(ClientContext)
}
