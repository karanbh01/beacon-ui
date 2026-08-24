import { useMemo } from 'react'
import { useWorkspace } from '../../state/tabs.store'
import type { Tab } from '../../state/tabs.types'

export interface LinkTarget {
  id: string
  /** What the row says — the source tab's title. */
  title: string
  /** The subject this tab would inherit, for the row's second line. */
  subject: string | undefined
}

export interface Linkage {
  /** Tabs this one could follow. Empty means there is nothing to link to. */
  targets: LinkTarget[]
  /** The source's title when following one, else undefined. */
  linkedTo: string | undefined
  link: (sourceId: string) => void
  unlink: () => void
}

/**
 * Who this tab could follow, and how to say so (BU-104).
 *
 * Linking existed in the store from BU-16 and had no way in: a tab could be
 * born linked, and the only way out was to type. `linkTab` and `severLink`
 * were both there, unreachable.
 *
 * The rules are the store's, restated here only as filters so the list never
 * offers something `linkTab` would refuse: a tab cannot follow itself, and a
 * linked tab cannot be a source, because chains are not in the taxonomy.
 */
export function useLinkTargets(tabId: string): Linkage {
  const tabs = useWorkspace((state) => state.tabs)
  const linkTab = useWorkspace((state) => state.linkTab)
  const severLink = useWorkspace((state) => state.severLink)

  const self = tabs.find((tab) => tab.id === tabId)

  const targets = useMemo(
    () =>
      tabs
        .filter((tab) => canFollow(tab, tabId))
        .map((tab) => ({
          id: tab.id,
          title: tab.title,
          subject: tab.subject
        })),
    [tabs, tabId]
  )

  const source = tabs.find((tab) => tab.id === self?.linkSourceId)

  return {
    targets,
    linkedTo: self?.archetype === 'linked' ? (source?.title ?? 'another tab') : undefined,
    link: (sourceId) => {
      linkTab(tabId, sourceId)
    },
    unlink: () => {
      severLink(tabId)
    }
  }
}

function canFollow(candidate: Tab, tabId: string): boolean {
  if (candidate.id === tabId) return false
  // `linkTab` refuses a linked source, so offering one would be a dead row.
  if (candidate.archetype === 'linked') return false
  // A source with no subject has nothing to give, and following it would
  // blank the follower.
  return candidate.subject !== undefined && candidate.subject !== ''
}
