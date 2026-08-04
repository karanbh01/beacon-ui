import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as logic from './tabs.logic'
import type { OpenTabInput } from './tabs.logic'
import type { Tab, WorkspaceState } from './tabs.types'

/**
 * Bumped when a stored workspace needs reshaping.
 *
 * Version 10 gives every tab a pane and re-keys the active map per pane
 * (BU-55). Version 9 dropped the seeded tabs (BU-59): every page opens empty
 * and the user opens what they want from the `+`.
 */
export const WORKSPACE_VERSION = 10

/**
 * The shape stored before version 10, when a page had exactly one pane.
 *
 * Every field is optional because this describes bytes off disk, not a value
 * the type system ever saw: a workspace written by a version that predates
 * any of these keys is a real input.
 */
interface SinglePaneWorkspace {
  tabs?: (Omit<Tab, 'pane'> & { pane?: number })[]
  activeByPage?: Record<string, string | undefined>
  activeByPane?: Record<string, string | undefined>
}

/**
 * Bring a stored workspace up to the current shape.
 *
 * Seeded ids are still dropped here: they name instruments nobody chose, and
 * against synthetic data they name instruments that do not exist. Everything
 * else lands in pane 0 — a workspace that opened in one pane before the split
 * existed was, by definition, arranged for one.
 */
export function migrateWorkspace(stored: unknown): WorkspaceState {
  const state = stored as SinglePaneWorkspace
  const tabs: Tab[] = (state.tabs ?? [])
    .filter((tab) => !tab.id.startsWith('seed-'))
    .map((tab) => ({ ...tab, pane: tab.pane ?? 0 }))

  const previous = state.activeByPane ?? state.activeByPage ?? {}
  const activeByPane = Object.fromEntries(
    Object.entries(previous).map(([key, id]) => [
      // A pre-v10 key is a bare page id; a v10 key already carries its pane.
      key.includes('#') ? key : logic.paneKey(key, 0),
      tabs.some((tab) => tab.id === id) ? id : undefined
    ])
  )

  return { tabs, activeByPane, closed: [] }
}

export interface WorkspaceStore extends WorkspaceState {
  openTab: (input: OpenTabInput) => void
  closeTab: (id: string, pane?: number, paneCount?: number) => void
  reopenTab: () => void
  selectTab: (id: string, pane?: number) => void
  moveTab: (id: string, pane: number, index: number, paneCount: number) => void
  setSubject: (id: string, subject: string) => void
  severLink: (id: string) => void
  linkTab: (id: string, sourceId: string) => void
  pinTab: (id: string, doc: string) => void
  setDirty: (id: string, dirty: boolean) => void
  openOrRetarget: (request: {
    page: string
    viewKind: string
    title: string
    subject: string
    pane?: number | undefined
  }) => void
  reset: () => void
}

/**
 * Thin zustand wrapper over the pure transitions in tabs.logic.
 *
 * All the semantics live there so they can be tested without a store or a
 * renderer. This file's only jobs are holding state and persisting it.
 */
export const useWorkspace = create<WorkspaceStore>()(
  persist(
    (set) => ({
      ...logic.emptyWorkspace(),

      openTab: (input) => {
        set((state) => logic.openTab(state, input))
      },
      closeTab: (id, pane, paneCount) => {
        set((state) => logic.closeTab(state, id, pane, paneCount))
      },
      reopenTab: () => {
        set((state) => logic.reopenTab(state))
      },
      selectTab: (id, pane) => {
        set((state) => logic.selectTab(state, id, pane))
      },
      moveTab: (id, pane, index, paneCount) => {
        set((state) => logic.moveTab(state, id, pane, index, paneCount))
      },
      setSubject: (id, subject) => {
        set((state) => logic.setSubject(state, id, subject))
      },
      severLink: (id) => {
        set((state) => logic.severLink(state, id))
      },
      linkTab: (id, sourceId) => {
        set((state) => logic.linkTab(state, id, sourceId))
      },
      pinTab: (id, doc) => {
        set((state) => logic.pinTab(state, id, doc))
      },
      setDirty: (id, dirty) => {
        set((state) => logic.setDirty(state, id, dirty))
      },
      openOrRetarget: (request) => {
        set((state) => logic.openOrRetarget(state, request))
      },
      reset: () => {
        set(logic.emptyWorkspace())
      }
    }),
    {
      name: 'beacon.workspace',
      version: WORKSPACE_VERSION,
      // Closed tabs are a session-scoped undo buffer, not workspace state —
      // reopening something from three days ago is surprising, not helpful.
      partialize: (state) => ({ tabs: state.tabs, activeByPane: state.activeByPane }),
      migrate: (persisted) => migrateWorkspace(persisted)
    }
  )
)

/** Subject a tab currently shows, resolving links live. */
export function useSubject(tab: Tab | undefined): string | undefined {
  return useWorkspace((state) => (tab === undefined ? undefined : logic.resolveSubject(state, tab)))
}
