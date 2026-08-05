import { useMemo, type ReactElement, type ReactNode } from 'react'
import type { Suggestion } from '../../components/TickerField/suggestions'
import { useWorkspace } from '../../state/tabs.store'
import { IdentifierIndexContext } from './identifierIndex'

/**
 * The LOCAL half of the suggestion index (BU-72).
 *
 * Search itself is the engine's job now (BN-127, `useIdentifierSearch`). What
 * was here before — a union of every universe's members, named by a reference
 * batch — was the client working around an API that could not enumerate its
 * own coverage. It was partial in a way the user could not see, and empty on
 * an engine with no universes configured. It is gone.
 *
 * What stays is what only the client knows: the subjects already open in the
 * workspace. They are offered after the ranked server rows, and they are the
 * whole list when there is no engine to ask — which is the case every time
 * py-beacon is restarting.
 *
 * These carry no `datasets`, deliberately. A tab subject makes no claim about
 * coverage, and `unavailableFor` reads that absence as "no claim made" so a
 * locally-sourced row is never marked unavailable on no evidence.
 */
export function IdentifierIndexProvider({ children }: { children: ReactNode }): ReactElement {
  const tabs = useWorkspace((state) => state.tabs)

  const index = useMemo<Suggestion[]>(() => {
    const seen = new Set<string>()
    const open: Suggestion[] = []

    for (const tab of tabs) {
      const subject = tab.subject
      if (subject === undefined || subject === '' || seen.has(subject)) continue
      seen.add(subject)
      open.push({ identifier: subject })
    }

    return open
  }, [tabs])

  return <IdentifierIndexContext.Provider value={index}>{children}</IdentifierIndexContext.Provider>
}
