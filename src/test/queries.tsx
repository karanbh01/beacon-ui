import type { ReactElement, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * A query client for components that reach for one, with no engine behind it.
 *
 * Since BU-72 the search field and the menu bar both run an identifier query,
 * so anything rendering either needs a `QueryClientProvider` — but not a
 * server. There is no `ClientContext` here on purpose: `useBeacon()` comes
 * back null, the query stays disabled, and the component takes its
 * no-engine path. That is the state the app is in every time py-beacon
 * restarts, so exercising it by default is worth more than mocking a client.
 *
 * Retries are off so a rejection surfaces on the first render pass instead of
 * after the query client's backoff, which would make every test wait on real
 * timers.
 */
export function WithQueries({ children }: { children: ReactNode }): ReactElement {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  })
  return <QueryClientProvider client={queries}>{children}</QueryClientProvider>
}
