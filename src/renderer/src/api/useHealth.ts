import { useQuery } from '@tanstack/react-query'
import { keys } from './keys'
import { useBeacon } from './queryClient'

/**
 * Format a data age the way the footer states it: "2h ago".
 *
 * Deliberately coarse. A footer that ticks every second draws the eye for no
 * reason, and nobody needs data freshness to the second.
 */
export function formatAge(seconds: number | null | undefined): string | undefined {
  if (seconds === null || seconds === undefined) return undefined
  if (seconds < 90) return 'just now'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${String(minutes)}m ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${String(hours)}h ago`

  const days = Math.round(hours / 24)
  return `${String(days)}d ago`
}

/**
 * /health, which carries the market data's age.
 *
 * Refetched on freshness events rather than on a timer — a sync publishes one,
 * and the provider invalidates this key.
 */
export function useHealth() {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.health(),
    queryFn: async ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/health', { signal })
    },
    enabled: client !== null
  })
}

/** The footer's "data updated · Nh ago", or undefined when there is no data. */
export function useDataAge(): string | undefined {
  const { data } = useHealth()
  return formatAge(data?.cache_age)
}
