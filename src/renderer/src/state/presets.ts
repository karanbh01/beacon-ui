import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { layoutFor, useChrome } from './chrome'
import { pageCode } from '../shell/pages'
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
   * Short, typed, and the point of it (BU-120): `DE001` reaches a Data
   * Explorer arrangement from the search bar on any page. The name is what
   * you call it; the code is what you can type without thinking.
   */
  code: string
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

/**
 * The next free code for a page: DE001, DE002, and so on.
 *
 * Numbered per prefix rather than globally, so the numbers on one page do not
 * jump because another page was busy.
 */
export function suggestCode(page: string, existing: readonly Preset[]): string {
  const prefix = pageCode(page)
  const taken = new Set(existing.map((preset) => preset.code.toUpperCase()))
  for (let n = 1; ; n++) {
    const code = `${prefix}${String(n).padStart(3, '0')}`
    if (!taken.has(code)) return code
  }
}

/** Uppercase and unspaced: it is meant to be typed into a search field. */
export function normaliseCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase()
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
  input: { id: string; name: string; code: string; page: string; layout: string },
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

/** By code or by name, from anywhere: search is app-wide, presets are not. */
export function matchesPreset(preset: Preset, needle: string): boolean {
  return preset.code.toLowerCase().includes(needle) || preset.name.toLowerCase().includes(needle)
}

/**
 * Give every stored preset a code (BU-120).
 *
 * Presets saved by BU-119 have none, and one without a code cannot be
 * searched for — which is now the main way they are reached.
 */
export function migratePresets(persisted: unknown): { presets: Preset[] } {
  const stored = persisted as { presets?: (Partial<Preset> & { id: string })[] } | undefined
  const presets: Preset[] = []

  for (const saved of stored?.presets ?? []) {
    if (saved.page === undefined || saved.layout === undefined) continue
    presets.push({
      id: saved.id,
      name: saved.name ?? saved.id,
      // Numbered against what this pass has already assigned, so a store of
      // five Data Explorer presets comes out DE001…DE005.
      code: normaliseCode(saved.code ?? '') || suggestCode(saved.page, presets),
      page: saved.page,
      layout: saved.layout,
      tabs: saved.tabs ?? []
    })
  }

  return { presets }
}

interface PresetsStore {
  presets: Preset[]
  /**
   * Saves the page's current arrangement, and answers with the preset saved.
   *
   * A name already in use on that page is replaced rather than duplicated.
   * The result comes back so the caller can confirm the code — one assigned
   * and never shown is one nobody can search for.
   */
  save: (name: string, page: string, code?: string) => Preset | undefined
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

      save: (name, page, code) => {
        const trimmed = name.trim()
        if (trimmed === '') return undefined

        const workspace = useWorkspace.getState()
        const layout = layoutFor(useChrome.getState().layoutByPage, page)
        const state = get()

        // Same name on the same page is the same preset, re-saved. Two
        // entries reading "Research" would be indistinguishable in a menu.
        const replacing = state.presets.find(
          (preset) => preset.page === page && preset.name === trimmed
        )
        const others = state.presets.filter((preset) => preset.id !== replacing?.id)
        const asked = normaliseCode(code ?? '')
        const free = asked !== '' && !others.some((preset) => preset.code === asked)

        const saved = capture(
          {
            id: replacing?.id ?? newPresetId(state.presets),
            name: trimmed,
            // A code already spoken for falls back to a fresh one rather than
            // refusing: saving the arrangement is the point, and two presets
            // answering to DE001 would make searching it a coin toss.
            code: free ? asked : suggestCode(page, others),
            page,
            layout
          },
          workspace.tabs,
          workspace.activeByPane
        )

        set({
          presets:
            replacing === undefined
              ? [...others, saved]
              : state.presets.map((preset) => (preset.id === saved.id ? saved : preset))
        })

        return saved
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
    {
      name: 'beacon.presets',
      version: 2,
      migrate: (persisted) => migratePresets(persisted)
    }
  )
)
