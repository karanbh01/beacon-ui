import { useMemo, type ReactElement, type ReactNode } from 'react'
import { useQueries } from '@tanstack/react-query'
import { keys } from '../../api/keys'
import { useBeacon } from '../../api/queryClient'
import { mergeIndex, type Suggestion } from '../../components/TickerField/suggestions'
import { useWorkspace } from '../../state/tabs.store'
import { IdentifierIndexContext } from './identifierIndex'
import { useReferenceBatch } from './queries'
import { useUniverses } from './strategyQueries'

/** Names for reference: only what a suggestion row shows. */
const SUGGESTION_FIELDS = ['name'] as const

function useUniverseIdentifiers(): string[] {
  const client = useBeacon()
  const universes = useUniverses()
  const catalogue = universes.data?.universes ?? []

  const members = useQueries({
    queries: catalogue.map((universe) => ({
      queryKey: keys.strategy.universeMembers(universe.id),
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        if (client === null) throw new Error('No engine')
        return client.universes.members(universe.id, signal)
      },
      enabled: client !== null
    }))
  })

  // A fan-out, but over the universe COUNT — a handful — not over names. The
  // one that mattered, a call per identifier, is the batch below.
  const ids = members.flatMap((query) => query.data?.identifiers ?? [])
  return [...new Set(ids)].sort()
}

export function IdentifierIndexProvider({ children }: { children: ReactNode }): ReactElement {
  const identifiers = useUniverseIdentifiers()
  const reference = useReferenceBatch(identifiers, SUGGESTION_FIELDS)
  const subjects = useWorkspace((state) => state.tabs)

  const index = useMemo(() => {
    const named: Suggestion[] = (reference.data?.entries ?? []).map((entry) => {
      // `fields` is absent for an identifier the store does not carry, which
      // is a suggestion worth keeping — it is still a name you can type.
      const name = entry.fields?.name
      return typeof name === 'string' && name !== ''
        ? { identifier: entry.identifier, name }
        : { identifier: entry.identifier }
    })

    const open: Suggestion[] = subjects
      .map((tab) => tab.subject)
      .filter((subject): subject is string => subject !== undefined && subject !== '')
      .map((identifier) => ({ identifier }))

    // Named first: a bare identifier from an open tab must not shadow the
    // same one from reference data, which knows what the company is called.
    return mergeIndex(
      named,
      identifiers.map((identifier) => ({ identifier })),
      open
    )
  }, [reference.data, identifiers, subjects])

  return <IdentifierIndexContext.Provider value={index}>{children}</IdentifierIndexContext.Provider>
}
