import type { Archetype, ClosedTab, Tab, WorkspaceState } from './tabs.types'

/**
 * Pure transitions. Kept free of zustand and React so every rule in
 * taxonomy §1–2 can be tested directly, which BU-16 requires before views
 * consume any of it.
 *
 * Every function returns new state; none mutate.
 */

export const MAX_REOPEN = 10

export function emptyWorkspace(): WorkspaceState {
  return { tabs: [], activeByPage: {}, closed: [] }
}

export function findTab(state: WorkspaceState, id: string): Tab | undefined {
  return state.tabs.find((tab) => tab.id === id)
}

export function tabsForPage(state: WorkspaceState, page: string): Tab[] {
  return state.tabs.filter((tab) => tab.page === page)
}

export function activeTab(state: WorkspaceState, page: string): Tab | undefined {
  const id = state.activeByPage[page]
  return id === undefined ? undefined : findTab(state, id)
}

/**
 * The subject a tab currently shows.
 *
 * For `linked`, this walks to the source rather than reading a stored copy —
 * that is what makes a link live. A broken link (source gone) resolves to
 * undefined rather than throwing; `closeTab` severs dependants, so this
 * should not happen, but a store that crashes on a dangling id would be
 * worse than one that shows nothing.
 */
export function resolveSubject(state: WorkspaceState, tab: Tab): string | undefined {
  if (tab.archetype === 'linked') {
    const source = tab.linkSourceId === undefined ? undefined : findTab(state, tab.linkSourceId)
    return source === undefined ? undefined : resolveSubject(state, source)
  }
  if (tab.archetype === 'pinned') return tab.pinnedDoc
  return tab.subject
}

/** Tabs that follow the given tab's subject. */
export function dependants(state: WorkspaceState, id: string): Tab[] {
  return state.tabs.filter((tab) => tab.archetype === 'linked' && tab.linkSourceId === id)
}

function replaceTab(state: WorkspaceState, id: string, update: (tab: Tab) => Tab): WorkspaceState {
  return { ...state, tabs: state.tabs.map((tab) => (tab.id === id ? update(tab) : tab)) }
}

export interface OpenTabInput {
  id: string
  page: string
  viewKind: string
  archetype: Archetype
  title: string
  subject?: string
  pinnedDoc?: string
  linkSourceId?: string
}

export function openTab(state: WorkspaceState, input: OpenTabInput): WorkspaceState {
  const tab: Tab = { ...input, dirty: false }
  return {
    ...state,
    tabs: [...state.tabs, tab],
    activeByPage: { ...state.activeByPage, [input.page]: input.id }
  }
}

export function selectTab(state: WorkspaceState, id: string): WorkspaceState {
  const tab = findTab(state, id)
  if (tab === undefined) return state
  return { ...state, activeByPage: { ...state.activeByPage, [tab.page]: id } }
}

/**
 * Closing a tab severs anything linked to it.
 *
 * Without this, a dependant keeps a dangling `linkSourceId` and silently
 * shows nothing. Severing on close preserves the last subject it was
 * showing, which is what the user was looking at a moment ago.
 */
export function closeTab(state: WorkspaceState, id: string): WorkspaceState {
  const tab = findTab(state, id)
  if (tab === undefined) return state

  const index = state.tabs.findIndex((candidate) => candidate.id === id)
  const followers = dependants(state, id)

  let next: WorkspaceState = state
  for (const follower of followers) {
    next = severLink(next, follower.id)
  }

  const remaining = next.tabs.filter((candidate) => candidate.id !== id)
  const siblings = remaining.filter((candidate) => candidate.page === tab.page)

  // Activate the neighbour that slid into this slot, else the last tab.
  const wasActive = next.activeByPage[tab.page] === id
  const fallback = siblings[Math.min(index, siblings.length - 1)]?.id

  const closed: ClosedTab[] = [{ tab, index }, ...next.closed].slice(0, MAX_REOPEN)

  return {
    tabs: remaining,
    activeByPage: {
      ...next.activeByPage,
      [tab.page]: wasActive ? fallback : next.activeByPage[tab.page]
    },
    closed
  }
}

export function reopenTab(state: WorkspaceState): WorkspaceState {
  const [entry, ...rest] = state.closed
  if (entry === undefined) return state

  const tabs = [...state.tabs]
  tabs.splice(Math.min(entry.index, tabs.length), 0, entry.tab)

  return {
    tabs,
    activeByPage: { ...state.activeByPage, [entry.tab.page]: entry.tab.id },
    closed: rest
  }
}

/**
 * Set a query tab's subject.
 *
 * Refuses on `pinned` (its pane exposes no query bar, taxonomy §2) and on
 * `linked` (its subject belongs to the source — callers must sever first).
 * Returning state unchanged rather than throwing keeps a stray call from
 * taking the app down, and the tests pin that it is genuinely a no-op.
 */
export function setSubject(state: WorkspaceState, id: string, subject: string): WorkspaceState {
  if (findTab(state, id)?.archetype !== 'query') return state
  return replaceTab(state, id, (current) => ({ ...current, subject }))
}

/**
 * Typing in a linked tab breaks the link (taxonomy §2).
 *
 * The severed tab keeps the subject it was showing and becomes an
 * independent query view — the chain drops, the subject chip stays.
 */
export function severLink(state: WorkspaceState, id: string): WorkspaceState {
  const tab = findTab(state, id)
  if (tab?.archetype !== 'linked') return state

  const inherited = resolveSubject(state, tab)
  return replaceTab(state, id, (current) => {
    const next: Tab = { ...current, archetype: 'query' }
    delete next.linkSourceId
    if (inherited !== undefined) next.subject = inherited
    return next
  })
}

export function linkTab(state: WorkspaceState, id: string, sourceId: string): WorkspaceState {
  const tab = findTab(state, id)
  const source = findTab(state, sourceId)
  if (tab === undefined || source === undefined) return state
  // A tab cannot follow itself, and chains of links are not in the taxonomy.
  if (id === sourceId || source.archetype === 'linked') return state

  return replaceTab(state, id, (current) => ({
    ...current,
    archetype: 'linked',
    linkSourceId: sourceId
  }))
}

/** Re-pin is the only way to change a pinned view's document (taxonomy §1). */
export function pinTab(state: WorkspaceState, id: string, doc: string): WorkspaceState {
  const tab = findTab(state, id)
  if (tab === undefined) return state
  return replaceTab(state, id, (current) => ({
    ...current,
    archetype: 'pinned',
    pinnedDoc: doc
  }))
}

/** Only documents carry dirty state (taxonomy §1). */
export function setDirty(state: WorkspaceState, id: string, dirty: boolean): WorkspaceState {
  if (findTab(state, id)?.archetype !== 'document') return state
  return replaceTab(state, id, (current) => ({ ...current, dirty }))
}
