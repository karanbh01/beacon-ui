import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as logic from './tabs.logic'
import type { OpenTabInput } from './tabs.logic'
import type { Tab, WorkspaceState } from './tabs.types'
import { SEED_TABS } from '../views/seed'

/**
 * Bumped whenever SEED_TABS gains a tab that an existing workspace should
 * receive. The seed itself only ever runs on an empty workspace, so without
 * this a user who launched the app once would never see a view added later.
 */
export const WORKSPACE_VERSION = 1

/**
 * Append seed tabs the workspace has never had.
 *
 * Safe to run because a migration runs once per version bump, not per launch:
 * a seed tab the user closed stays closed, and only tabs introduced since
 * their last version appear.
 */
export function addNewSeedTabs(state: WorkspaceState): WorkspaceState {
  return SEED_TABS.reduce(
    (acc, input) => (acc.tabs.some((tab) => tab.id === input.id) ? acc : logic.openTab(acc, input)),
    state
  )
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
      migrate: (persisted) => addNewSeedTabs(persisted as WorkspaceState)
    }
  )
)

/** Subject a tab currently shows, resolving links live. */
export function useSubject(tab: Tab | undefined): string | undefined {
  return useWorkspace((state) => (tab === undefined ? undefined : logic.resolveSubject(state, tab)))
}
