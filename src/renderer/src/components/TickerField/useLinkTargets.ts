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
  /** Titles of the tabs following this one, when it is a source. */
  followers: string[]
  /** True at either end of a link — both wear the chain (BU-108). */
  inLink: boolean
  /** What the unlink control should say, or undefined when there is none. */
  unlinkLabel: string | undefined
  link: (sourceId: string) => void
  /** Breaks the link from whichever end this tab is (BU-109). */
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
  const unlinkTab = useWorkspace((state) => state.unlinkTab)

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
  const followers = tabs.filter((tab) => tab.linkSourceId === tabId).map((tab) => tab.title)
  const linkedTo = self?.archetype === 'linked' ? (source?.title ?? 'another tab') : undefined

  return {
    targets,
    linkedTo,
    followers,
    inLink: linkedTo !== undefined || followers.length > 0,
    unlinkLabel: unlinkLabelFor(linkedTo, followers),
    link: (sourceId) => {
      linkTab(tabId, sourceId)
    },
    unlink: () => {
      unlinkTab(tabId)
    }
  }
}

/**
 * Naming what unlinking will actually do.
 *
 * A follower leaves on its own; a source dissolves the group, so with more
 * than one follower the control has to say so rather than implying the same
 * small act.
 */
function unlinkLabelFor(linkedTo: string | undefined, followers: string[]): string | undefined {
  if (linkedTo !== undefined) return `Unlink from ${linkedTo}`
  if (followers.length === 1) return `Unlink from ${followers[0] ?? ''}`
  if (followers.length > 1) return `Unlink all ${String(followers.length)} followers`
  return undefined
}

function canFollow(candidate: Tab, tabId: string): boolean {
  if (candidate.id === tabId) return false
  // `linkTab` refuses a linked source, so offering one would be a dead row.
  if (candidate.archetype === 'linked') return false
  // A source with no subject has nothing to give, and following it would
  // blank the follower.
  return candidate.subject !== undefined && candidate.subject !== ''
}
