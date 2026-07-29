/**
 * Tab model, specified from taxonomy §1–2 before any view consumes it.
 *
 * The six archetypes in §1 reduce to five stored shapes, because "document
 * (active)" and "document (dirty)" differ only by the `dirty` flag — active
 * is a property of the workspace, not of the tab.
 *
 *   archetype   chip            subject source        can type?
 *   ---------   -------------   -------------------   ---------
 *   document    none            n/a                   n/a
 *   global      none            n/a                   n/a
 *   query       subject         its own `subject`     yes
 *   linked      subject+chain   ANOTHER TAB, live     yes → severs
 *   pinned      chain           `pinnedDoc`, fixed    no query bar
 *
 * The single most important rule: a linked tab does NOT store a subject. It
 * resolves one from its source every read. Storing a copy is the obvious
 * shortcut and it is wrong — the copy drifts the moment the source changes,
 * which is exactly the behaviour the link exists to provide.
 */

export type Archetype = 'document' | 'global' | 'query' | 'linked' | 'pinned'

export interface Tab {
  id: string
  /** Sidebar page this tab belongs to. Tabs are per-page (BU-17). */
  page: string
  /** Which view component renders in the pane. */
  viewKind: string
  archetype: Archetype
  title: string
  /** Own subject. Only meaningful for `query`. */
  subject?: string
  /** Document this view is pinned to. Only meaningful for `pinned`. */
  pinnedDoc?: string
  /** Tab whose subject this one follows. Only meaningful for `linked`. */
  linkSourceId?: string
  /** Unsaved changes. Only documents own dirty state (taxonomy §1). */
  dirty: boolean
}

/** A closed tab kept for reopen, with the index it occupied. */
export interface ClosedTab {
  tab: Tab
  index: number
}

export interface WorkspaceState {
  tabs: Tab[]
  /** Active tab id per page, so switching pages restores where you were. */
  activeByPage: Record<string, string | undefined>
  /** Most-recently-closed first. */
  closed: ClosedTab[]
}
