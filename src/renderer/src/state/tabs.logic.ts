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
  return { tabs: [], activeByPane: {}, closed: [], activatedAt: {} }
}

/**
 * A counter, not a clock (BU-79).
 *
 * All that is asked of these stamps is an ORDER, and `Date.now()` can return
 * the same millisecond twice in a row for two fast selections — which would
 * make the order of those two arbitrary. A counter cannot tie.
 */
let activations = 0

function stamp(state: WorkspaceState, id: string): Record<string, number | undefined> {
  activations += 1
  return { ...state.activatedAt, [id]: activations }
}

/**
 * Tabs, most recently activated first. Never-activated ones come last.
 *
 * Takes the two pieces rather than the whole state on purpose: it builds a
 * NEW array, so using it directly as a zustand selector re-renders forever —
 * every call returns a reference the default equality check has not seen.
 * Callers select `tabs` and `activatedAt`, which are stable, and memoise
 * this.
 */
export function recentTabs(
  tabs: readonly Tab[],
  activatedAt: Record<string, number | undefined>
): Tab[] {
  return [...tabs].sort((a, b) => (activatedAt[b.id] ?? 0) - (activatedAt[a.id] ?? 0))
}

export function paneKey(page: string, pane: number): string {
  return `${page}#${String(pane)}`
}

/**
 * The pane a tab is drawn in, which is not always the pane it belongs to.
 *
 * A layout change must not destroy an arrangement, so collapsing four panes
 * to one folds the strays into the last visible pane rather than rewriting
 * them. Splitting again puts every tab back where its owner left it.
 */
export function visiblePane(tab: Tab, paneCount: number): number {
  return Math.min(tab.pane, Math.max(paneCount - 1, 0))
}

export function findTab(state: WorkspaceState, id: string): Tab | undefined {
  return state.tabs.find((tab) => tab.id === id)
}

/**
 * Every tab on a page, across all its panes.
 *
 * Still page-wide, and that is the point: the new-tab menu gates a linked
 * view on there being a query tab to follow, and a source in the pane next
 * door is exactly the arrangement a split is for.
 */
export function tabsForPage(state: WorkspaceState, page: string): Tab[] {
  return state.tabs.filter((tab) => tab.page === page)
}

export function tabsForPane(
  state: WorkspaceState,
  page: string,
  pane: number,
  paneCount: number
): Tab[] {
  return tabsForPage(state, page).filter((tab) => visiblePane(tab, paneCount) === pane)
}

/**
 * The tab a pane is showing.
 *
 * Falls back to the first tab in the pane when the stored id is not among
 * them — which is what happens the first time a collapse folds someone else's
 * tabs into this strip. A pane with tabs in it must never draw the empty
 * state.
 */
export function activeTab(
  state: WorkspaceState,
  page: string,
  pane = 0,
  paneCount = 1
): Tab | undefined {
  const visible = tabsForPane(state, page, pane, paneCount)
  const id = state.activeByPane[paneKey(page, pane)]
  return visible.find((tab) => tab.id === id) ?? visible[0]
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
  /** Pane to open into. Defaults to the first — the `+` that was clicked. */
  pane?: number | undefined
  subject?: string
  pinnedDoc?: string
  linkSourceId?: string
}

export function openTab(state: WorkspaceState, input: OpenTabInput): WorkspaceState {
  const pane = input.pane ?? 0
  const tab: Tab = { ...input, pane, dirty: false }
  return {
    ...state,
    tabs: [...state.tabs, tab],
    activeByPane: { ...state.activeByPane, [paneKey(input.page, pane)]: input.id },
    activatedAt: stamp(state, input.id)
  }
}

/**
 * `pane` is the pane the tab was clicked in, which under a collapsed layout
 * is not the pane it is stored in. Omitting it selects in its own pane, which
 * is right for every caller that is not a tab strip.
 */
export function selectTab(state: WorkspaceState, id: string, pane?: number): WorkspaceState {
  const tab = findTab(state, id)
  if (tab === undefined) return state
  return {
    ...state,
    activeByPane: { ...state.activeByPane, [paneKey(tab.page, pane ?? tab.pane)]: id },
    activatedAt: stamp(state, id)
  }
}

/**
 * Move a tab into `pane` at `index` among that pane's tabs.
 *
 * The drag-and-drop transition (BU-55). Two things it deliberately does not
 * do: it does not touch `linkSourceId`, because a link is by id and not by
 * proximity — dragging a Charting tab away from its Prices source leaves it
 * following that source across the split, which is the arrangement the
 * linked archetype exists for. And it does not copy: the tab leaves the pane
 * it came from.
 */
export function moveTab(
  state: WorkspaceState,
  id: string,
  pane: number,
  index: number,
  paneCount: number
): WorkspaceState {
  const tab = findTab(state, id)
  if (tab === undefined) return state

  const moved: Tab = { ...tab, pane }
  const others = state.tabs.filter((candidate) => candidate.id !== id)

  // `index` counts within the destination pane; splice needs a position in
  // the flat list, so it is resolved against the tab already at that slot.
  const destination = others.filter(
    (candidate) => candidate.page === tab.page && visiblePane(candidate, paneCount) === pane
  )
  const before = destination[index]
  const at = before === undefined ? others.length : others.indexOf(before)

  const tabs = [...others]
  tabs.splice(at, 0, moved)

  return {
    ...state,
    tabs,
    activeByPane: { ...state.activeByPane, [paneKey(tab.page, pane)]: id }
  }
}

/**
 * Closing a tab severs anything linked to it.
 *
 * Without this, a dependant keeps a dangling `linkSourceId` and silently
 * shows nothing. Severing on close preserves the last subject it was
 * showing, which is what the user was looking at a moment ago.
 */
export function closeTab(
  state: WorkspaceState,
  id: string,
  pane?: number,
  paneCount = 1
): WorkspaceState {
  const tab = findTab(state, id)
  if (tab === undefined) return state

  const from = pane ?? tab.pane
  const key = paneKey(tab.page, from)
  const index = state.tabs.findIndex((candidate) => candidate.id === id)
  const followers = dependants(state, id)

  let next: WorkspaceState = state
  for (const follower of followers) {
    next = severLink(next, follower.id)
  }

  const remaining = next.tabs.filter((candidate) => candidate.id !== id)

  // The fallback comes from this PANE, not the page: the neighbour that slid
  // into the slot is the one in the same strip, and activating a tab in a
  // different pane would move the selection somewhere the user is not
  // looking.
  const siblings = remaining.filter(
    (candidate) =>
      candidate.page === tab.page && visiblePane(candidate, Math.max(paneCount, from + 1)) === from
  )
  const position = siblings.findIndex((candidate) => state.tabs.indexOf(candidate) > index)
  const fallback = (position === -1 ? siblings[siblings.length - 1] : siblings[position])?.id

  const wasActive = next.activeByPane[key] === id
  const closed: ClosedTab[] = [{ tab, index }, ...next.closed].slice(0, MAX_REOPEN)

  return {
    tabs: remaining,
    activeByPane: { ...next.activeByPane, [key]: wasActive ? fallback : next.activeByPane[key] },
    closed,
    activatedAt: next.activatedAt
  }
}

export function reopenTab(state: WorkspaceState): WorkspaceState {
  const [entry, ...rest] = state.closed
  if (entry === undefined) return state

  const tabs = [...state.tabs]
  tabs.splice(Math.min(entry.index, tabs.length), 0, entry.tab)

  return {
    tabs,
    activeByPane: {
      ...state.activeByPane,
      [paneKey(entry.tab.page, entry.tab.pane)]: entry.tab.id
    },
    closed: rest,
    // Reopening IS an activation: it is the tab you just asked for.
    activatedAt: stamp(state, entry.tab.id)
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

/**
 * Point an existing view at a subject, or open one if there is none.
 *
 * What a cross-view jump needs — clicking a watchlist row to see its prices.
 * Retargeting the tab that is already open beats opening a second one: the
 * pane the user has arranged stays where it is, and anything linked to it
 * follows along, which is the whole point of a link.
 *
 * Only `query` tabs are retargeted. A pinned tab has no subject to change and
 * a linked one would sever, so both get a new tab instead of being hijacked.
 */
export function openOrRetarget(
  state: WorkspaceState,
  request: {
    page: string
    viewKind: string
    title: string
    subject: string
    pane?: number | undefined
  }
): WorkspaceState {
  const existing = state.tabs.find(
    (tab) =>
      tab.page === request.page && tab.viewKind === request.viewKind && tab.archetype === 'query'
  )

  if (existing !== undefined) {
    return selectTab(setSubject(state, existing.id, request.subject), existing.id)
  }

  return openTab(state, {
    id: `${request.viewKind}-${request.subject}`,
    page: request.page,
    viewKind: request.viewKind,
    archetype: 'query',
    title: request.title,
    pane: request.pane ?? 0,
    subject: request.subject
  })
}
