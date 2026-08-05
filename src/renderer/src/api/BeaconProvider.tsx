import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { EngineState } from '@shared/ipc'
import { IdentifierIndexProvider } from '../views/shared/IdentifierIndexProvider'
import { createClient } from './client'
import { eventsUrl, parseEvent } from './events'
import { useJobs } from './jobs'
import { invalidationsFor } from './keys'
import { ClientContext, makeQueryClient } from './queryClient'

/** Reconnect delay for the event socket. */
const SOCKET_RETRY_MS = 1_500

export interface BeaconProviderProps {
  engine: EngineState
  children: ReactNode
  queryClient?: QueryClient
  /** Injected in tests, so the socket can be driven without a server. */
  socketFactory?: (url: string) => WebSocket
}

/**
 * Wires the engine to the query cache and the event feed.
 *
 * Rebuilds the client whenever the engine's URL or token changes, which is
 * what makes a restart transparent to views: they keep calling `useBeacon()`
 * and get a client pointed at the new port.
 */
export function BeaconProvider({
  engine,
  children,
  queryClient,
  socketFactory
}: BeaconProviderProps): ReactElement {
  const [queries] = useState(() => queryClient ?? makeQueryClient())
  const applyJob = useJobs((state) => state.apply)

  const client = useMemo(() => {
    if (engine.baseUrl === undefined || engine.token === undefined) return null
    return createClient({
      baseUrl: engine.baseUrl,
      token: engine.token,
      ...(engine.version === undefined ? {} : { serverVersion: engine.version })
    })
  }, [engine.baseUrl, engine.token, engine.version])

  const { baseUrl, token, status } = engine
  const retryTimer = useRef<NodeJS.Timeout>(undefined)

  useEffect(() => {
    if (baseUrl === undefined || token === undefined || status !== 'connected') return undefined

    let socket: WebSocket | null = null
    let closed = false

    const connect = (): void => {
      if (closed) return
      const url = eventsUrl(baseUrl, token)
      socket = socketFactory === undefined ? new WebSocket(url) : socketFactory(url)

      socket.onmessage = (message: MessageEvent<string>) => {
        let raw: unknown
        try {
          raw = JSON.parse(message.data)
        } catch {
          return
        }
        const event = parseEvent(raw)
        if (event === undefined) return

        if (event.type === 'job') {
          applyJob(event)
          // A finished job's output is now readable, so anything it could
          // have changed is refetched. Without this the pane keeps showing
          // pre-job numbers until something else happens to invalidate.
          if (event.status === 'succeeded') {
            void queries.invalidateQueries()
          }
          return
        }

        // Freshness is per dataset, so only the affected prefixes drop.
        for (const key of invalidationsFor(event.dataset)) {
          void queries.invalidateQueries({ queryKey: key })
        }
      }

      socket.onclose = () => {
        if (closed) return
        // The engine restarting closes this socket; reconnecting on a short
        // timer means events resume without the user doing anything.
        retryTimer.current = setTimeout(connect, SOCKET_RETRY_MS)
      }
    }

    connect()

    return () => {
      closed = true
      if (retryTimer.current !== undefined) clearTimeout(retryTimer.current)
      socket?.close()
    }
  }, [baseUrl, token, status, applyJob, queries, socketFactory])

  return (
    <QueryClientProvider client={queries}>
      <ClientContext.Provider value={client}>
        {/* One identifier index for the whole app (BU-68), rather than each
            query view running the same fan-out. */}
        <IdentifierIndexProvider>{children}</IdentifierIndexProvider>
      </ClientContext.Provider>
    </QueryClientProvider>
  )
}
