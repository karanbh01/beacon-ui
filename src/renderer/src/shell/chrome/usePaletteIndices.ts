import { useMemo } from 'react'
import { useIndices } from '../../views/shared/strategyQueries'
import { useWorkspace } from '../../state/tabs.store'
import type { IndexRef } from './searchResults'

/**
 * The index catalogue, for the palette's INDICES group (BU-79).
 *
 * `GET /indices` has existed all along; `searchResults` carried a comment
 * saying the group had nothing behind it, which was true of the CLIENT rather
 * than of the engine.
 *
 * The dirty flag is the client's own contribution: the engine has no idea
 * which of its indices somebody has half-edited in a tab, and a palette that
 * offered to open one without saying so would lose the changes' only visible
 * trace. It is the same dot the tab strip draws.
 */
export function usePaletteIndices(): IndexRef[] {
  const indices = useIndices()
  const tabs = useWorkspace((state) => state.tabs)

  return useMemo(() => {
    const dirty = new Set(tabs.filter((tab) => tab.dirty).map((tab) => tab.pinnedDoc ?? tab.title))

    // `name` is required by the schema, so no defensive check here.
    return (indices.data?.indices ?? []).map((index) => ({
      id: index.id,
      name: index.name,
      ...(dirty.has(index.id) ? { dirty: true } : {})
    }))
  }, [indices.data, tabs])
}
