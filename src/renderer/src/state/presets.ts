import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { layoutFor, useChrome } from './chrome'
import { newTabId, paneKey, replacePage } from './tabs.logic'
import { useWorkspace } from './tabs.store'
import type { Archetype, Tab, WorkspaceState } from './tabs.types'

/**
 * A saved arrangement: the layout, the tabs, and what was active (BU-119).
 *
 * Nothing about the DATA is saved. A preset that restores a Prices tab on
 * CMP001 restores the tab; the tab fetches what is current. Anything else
 * would be a stale copy of the engine's answer, which is the failure mode
 * the whole app is built to avoid.
 */
export interface PresetTab {
  pane: number
  viewKind: string
  archetype: Archetype
  title: string
  subject?: string
  pinnedDoc?: string
  /**
   * Index of the tab this one follows, within this preset's own list.
   *
   * Positional because a link is by id and restored tabs get NEW ids. Storing
   * the old id would restore a link to a tab that no longer exists, which
   * reads on screen as an unlinked tab that still shows the chain.
   */
  linkSource?: number
  /** Was the active tab in its pane. */
  active?: boolean
}

export interface Preset {
  id: string
  name: string
  /**
   * Presets belong to a page.
   *
   * A view that exists on Data Explorer may not exist on Reports, so a preset
   * offered there could name views the page cannot open.
   */
  page: string
  layout: string
  tabs: readonly PresetTab[]
}

/** Deterministic, for the same reasons tab ids are. */
export function newPresetId(existing: readonly Preset[]): string {
  const taken = new Set(existing.map((preset) => preset.id))
  for (let n = 1; ; n++) {
    const id = `preset-${String(n)}`
    if (!taken.has(id)) return id
  }
}

/**
 * Capture a page's arrangement.
 *
 * Tab order is preserved as stored, because that IS the order the strips
 * draw: `tabsForPane` filters the same array.
 */
export function capture(
  input: { id: string; name: string; page: string; layout: string },
  tabs: readonly Tab[],
  activeByPane: Record<string, string | undefined>
): Preset {
  const mine = tabs.filter((tab) => tab.page === input.page)
  const index = new Map(mine.map((tab, at) => [tab.id, at]))

  return {
    ...input,
    tabs: mine.map((tab) => {
      const source = tab.linkSourceId === undefined ? undefined : index.get(tab.linkSourceId)
      return {
        pane: tab.pane,
        viewKind: tab.viewKind,
        archetype: tab.archetype,
        title: tab.title,
        ...(tab.subject === undefined ? {} : { subject: tab.subject }),
        ...(tab.pinnedDoc === undefined ? {} : { pinnedDoc: tab.pinnedDoc }),
        ...(source === undefined ? {} : { linkSource: source }),
        ...(activeByPane[paneKey(input.page, tab.pane)] === tab.id ? { active: true } : {})
      }
    })
  }
}

/**
 * The tabs a preset restores to, and which of them is active in each pane.
 *
 * Ids are minted against the tabs that will REMAIN — every page but this one
 * — so a restored tab cannot collide with one open elsewhere. They are minted
 * in two passes because a link needs the id of a tab that may come later in
 * the list.
 */
export function restore(
  preset: Preset,
  keeping: readonly Tab[]
): { tabs: Tab[]; actives: Record<string, string | undefined> } {
  const minted: Tab[] = []

  for (const saved of preset.tabs) {
    minted.push({
      id: newTabId(saved.viewKind, [...keeping, ...minted]),
      page: preset.page,
      pane: saved.pane,
      viewKind: saved.viewKind,
      archetype: saved.archetype,
      title: saved.title,
      ...(saved.subject === undefined ? {} : { subject: saved.subject }),
      ...(saved.pinnedDoc === undefined ? {} : { pinnedDoc: saved.pinnedDoc }),
      dirty: false
    })
  }

  preset.tabs.forEach((saved, at) => {
    const source = saved.linkSource === undefined ? undefined : minted[saved.linkSource]
    const tab = minted[at]
    if (tab === undefined || source === undefined) return
    tab.linkSourceId = source.id
  })

  const actives: Record<string, string | undefined> = {}
  preset.tabs.forEach((saved, at) => {
    const tab = minted[at]
    if (tab === undefined) return
    // First tab in a pane is a better answer than none: a pane whose active
    // id is missing falls back to its first tab anyway, so say so plainly.
    const key = paneKey(preset.page, saved.pane)
    if (saved.active === true || actives[key] === undefined) actives[key] = tab.id
  })

  return { tabs: minted, actives }
}

/** Applying a preset, as one workspace transition. */
export function applied(state: WorkspaceState, preset: Preset): WorkspaceState {
  const keeping = state.tabs.filter((tab) => tab.page !== preset.page)
  const { tabs, actives } = restore(preset, keeping)
  return replacePage(state, preset.page, tabs, actives)
}

export function presetsFor(presets: readonly Preset[], page: string): Preset[] {
  return presets.filter((preset) => preset.page === page)
}

interface PresetsStore {
  presets: Preset[]
  /** Saves the page's current arrangement. A name already in use is replaced. */
  save: (name: string, page: string) => void
  apply: (id: string) => void
  forget: (id: string) => void
}

/**
 * The saved arrangements, and the two stores they span.
 *
 * A preset is a layout AND a set of tabs, which live in different stores, so
 * something has to know both. Doing it here rather than in a component keeps
 * the pair atomic — a layout applied without its tabs is an arrangement
 * nobody saved.
 */
export const usePresets = create<PresetsStore>()(
  persist(
    (set, get) => ({
      presets: [],

      save: (name, page) => {
        const trimmed = name.trim()
        if (trimmed === '') return

        const workspace = useWorkspace.getState()
        const layout = layoutFor(useChrome.getState().layoutByPage, page)

        set((state) => {
          // Same name on the same page is the same preset, re-saved. Two
          // entries reading "Research" would be indistinguishable in a menu.
          const replacing = state.presets.find(
            (preset) => preset.page === page && preset.name === trimmed
          )
          const id = replacing?.id ?? newPresetId(state.presets)
          const saved = capture(
            { id, name: trimmed, page, layout },
            workspace.tabs,
            workspace.activeByPane
          )

          return {
            presets:
              replacing === undefined
                ? [...state.presets, saved]
                : state.presets.map((preset) => (preset.id === id ? saved : preset))
          }
        })
      },

      apply: (id) => {
        const preset = get().presets.find((entry) => entry.id === id)
        if (preset === undefined) return

        useChrome.getState().setLayout(preset.page, preset.layout)
        // Written through `setState` rather than as an action on the
        // workspace store, so that store never has to import this one: two
        // zustand modules importing each other is a cycle, and a cycle
        // between two PERSISTED stores is one that shows up as state
        // quietly not being there.
        useWorkspace.setState((state) => applied(state, preset))
      },

      forget: (id) => {
        set((state) => ({ presets: state.presets.filter((preset) => preset.id !== id) }))
      }
    }),
    { name: 'beacon.presets', version: 1 }
  )
)
