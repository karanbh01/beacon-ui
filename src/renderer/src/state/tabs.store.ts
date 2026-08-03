import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as logic from './tabs.logic'
import type { OpenTabInput } from './tabs.logic'
import type { Tab, WorkspaceState } from './tabs.types'

/**
 * Bumped when a stored workspace needs reshaping.
 *
 * Version 9 drops the seeded tabs (BU-59): every page opens empty and the
 * user opens what they want from the `+`. The migration clears tabs whose ids
 * came from the seed, because they name instruments nobody chose — and with
 * synthetic data they name instruments that do not exist.
 */
export const WORKSPACE_VERSION = 9

/** Ids the seed used, all of which were `seed-` prefixed. */
export function dropSeededTabs(state: WorkspaceState): WorkspaceState {
  const tabs = state.tabs.filter((tab) => !tab.id.startsWith('seed-'))
  const activeByPage = Object.fromEntries(
    Object.entries(state.activeByPage).map(([page, id]) => [
      page,
      tabs.some((tab) => tab.id === id) ? id : undefined
    ])
  )
  return { ...state, tabs, activeByPage, closed: [] }
}

export interface WorkspaceStore extends WorkspaceState {
  openTab: (input: OpenTabInput) => void
  closeTab: (id: string) => void
  reopenTab: () => void
  selectTab: (id: string) => void
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
      closeTab: (id) => {
        set((state) => logic.closeTab(state, id))
      },
      reopenTab: () => {
        set((state) => logic.reopenTab(state))
      },
      selectTab: (id) => {
        set((state) => logic.selectTab(state, id))
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
      partialize: (state) => ({ tabs: state.tabs, activeByPage: state.activeByPage }),
      migrate: (persisted) => dropSeededTabs(persisted as WorkspaceState)
    }
  )
)

/** Subject a tab currently shows, resolving links live. */
export function useSubject(tab: Tab | undefined): string | undefined {
  return useWorkspace((state) => (tab === undefined ? undefined : logic.resolveSubject(state, tab)))
}
