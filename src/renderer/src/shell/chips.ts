import type { TabChip } from '../components/Tab/Tab'
import type { Tab } from '../state/tabs.types'

/**
 * Archetype → chip, the mapping taxonomy §1–2 defines.
 *
 * A chip means the tab is bound to an object; the chain inside it means the
 * value follows something else. Documents and global tools are bound to
 * nothing, so they carry no chip at all.
 */
export function chipFor(
  tab: Tab,
  subject: string | undefined,
  /**
   * Whether another tab follows this one (BU-108).
   *
   * A link has two ends and the chain is how it is visible. Marking only the
   * follower left the source looking independent, so nothing on screen said
   * the two were related — you had to remember.
   */
  isSource = false
): TabChip | undefined {
  if (tab.archetype === 'pinned') {
    return tab.pinnedDoc === undefined ? undefined : { kind: 'pin', target: tab.pinnedDoc }
  }
  if (tab.archetype === 'linked') {
    return subject === undefined ? undefined : { kind: 'query', subject, linked: true }
  }
  if (tab.archetype === 'query') {
    if (subject === undefined) return undefined
    return isSource ? { kind: 'query', subject, linked: true } : { kind: 'query', subject }
  }
  return undefined
}
