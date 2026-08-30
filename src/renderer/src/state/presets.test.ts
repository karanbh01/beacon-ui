import { describe, expect, it } from 'vitest'
import {
  applied,
  capture,
  loadableTabs,
  matchesPreset,
  migratePresets,
  newPresetId,
  normaliseCode,
  presetsFor,
  restore,
  suggestCode,
  type Preset
} from './presets'
import { emptyWorkspace, paneKey } from './tabs.logic'
import type { Tab, WorkspaceState } from './tabs.types'

function tab(over: Partial<Tab> & { id: string }): Tab {
  return {
    page: 'data-explorer',
    pane: 0,
    viewKind: 'prices',
    archetype: 'query',
    title: 'Prices',
    dirty: false,
    ...over
  }
}

const ARRANGED: WorkspaceState = {
  ...emptyWorkspace(),
  tabs: [
    tab({ id: 'tab-prices', subject: 'CMP001' }),
    tab({ id: 'tab-charting', pane: 1, viewKind: 'charting', title: 'Charting' }),
    tab({ id: 'tab-reference', pane: 1, viewKind: 'reference', title: 'Reference Data' }),
    // Another page's work, which a preset must neither capture nor disturb.
    tab({ id: 'tab-reports', page: 'reports', viewKind: 'reports', title: 'Reports' })
  ],
  activeByPane: {
    [paneKey('data-explorer', 0)]: 'tab-prices',
    [paneKey('data-explorer', 1)]: 'tab-reference',
    [paneKey('reports', 0)]: 'tab-reports'
  }
}

const NAMED = {
  id: 'preset-1',
  name: 'Research',
  code: 'DE001',
  page: 'data-explorer',
  layout: 'columns'
}

describe('capture', () => {
  it('takes the page it names and nothing else', () => {
    const preset = capture(NAMED, ARRANGED.tabs, ARRANGED.activeByPane)

    expect(preset.tabs).toHaveLength(3)
    expect(preset.tabs.map((entry) => entry.viewKind)).toEqual(['prices', 'charting', 'reference'])
  })

  it('records which tab was active in each pane, and only those', () => {
    const preset = capture(NAMED, ARRANGED.tabs, ARRANGED.activeByPane)

    expect(preset.tabs.filter((entry) => entry.active === true).map((entry) => entry.viewKind)) //
      .toEqual(['prices', 'reference'])
  })

  it('saves no data, only what was open', () => {
    // A subject is what the tab was pointed AT; the rows it showed are the
    // engine's answer, and restoring a copy of those would be a stale one.
    const preset = capture(NAMED, ARRANGED.tabs, ARRANGED.activeByPane)
    expect(preset.tabs[0]).toEqual({ pane: 0, ...pricesShape, subject: 'CMP001', active: true })
  })
})

const pricesShape = { viewKind: 'prices', archetype: 'query' as const, title: 'Prices' }

describe('restore', () => {
  it('mints ids that cannot collide with tabs on other pages', () => {
    const preset = capture(NAMED, ARRANGED.tabs, ARRANGED.activeByPane)
    const keeping = [tab({ id: 'tab-prices', page: 'beacon-view' })]

    const { tabs } = restore(preset, keeping)

    expect(tabs.map((entry) => entry.id)).not.toContain('tab-prices')
    expect(new Set(tabs.map((entry) => entry.id)).size).toBe(tabs.length)
  })

  it('puts every tab back in its own pane, and marks the active one', () => {
    const preset = capture(NAMED, ARRANGED.tabs, ARRANGED.activeByPane)
    const { tabs, actives } = restore(preset, [])

    expect(tabs.map((entry) => entry.pane)).toEqual([0, 1, 1])
    expect(actives[paneKey('data-explorer', 1)]).toBe(tabs[2]?.id)
  })

  it('rebuilds a link to the restored source rather than the old id', () => {
    // The link is by id and the ids are new, so a preset that stored the old
    // one would restore a chain pointing at a tab that no longer exists.
    const linked: WorkspaceState = {
      ...ARRANGED,
      tabs: [
        tab({ id: 'tab-prices', subject: 'CMP001' }),
        tab({
          id: 'tab-charting',
          pane: 1,
          viewKind: 'charting',
          title: 'Charting',
          archetype: 'linked',
          linkSourceId: 'tab-prices'
        })
      ]
    }

    const preset = capture(NAMED, linked.tabs, linked.activeByPane)
    expect(preset.tabs[1]?.linkSource).toBe(0)

    // Restored beside a tab already holding `tab-prices`, so the source is
    // forced to a new id — and the link has to follow it there. Restoring
    // into an empty workspace would mint the same id back and prove nothing.
    const { tabs } = restore(preset, [tab({ id: 'tab-prices', page: 'beacon-view' })])

    expect(tabs[0]?.id).not.toBe('tab-prices')
    expect(tabs[1]?.linkSourceId).toBe(tabs[0]?.id)
  })

  it('gives a pane an active tab even when the preset named none', () => {
    const preset: Preset = { ...NAMED, tabs: [{ pane: 0, ...pricesShape }] }
    const { tabs, actives } = restore(preset, [])
    expect(actives[paneKey('data-explorer', 0)]).toBe(tabs[0]?.id)
  })
})

describe('applied', () => {
  it('replaces the page and leaves every other page alone', () => {
    const preset = capture(NAMED, ARRANGED.tabs, ARRANGED.activeByPane)
    const changed: WorkspaceState = {
      ...ARRANGED,
      tabs: [
        tab({ id: 'tab-actions', viewKind: 'actions' }),
        tab({ id: 'tab-reports', page: 'reports' })
      ]
    }

    const next = applied(changed, preset)

    expect(next.tabs.filter((entry) => entry.page === 'data-explorer')).toHaveLength(3)
    expect(next.tabs.some((entry) => entry.id === 'tab-actions')).toBe(false)
    expect(next.tabs.some((entry) => entry.id === 'tab-reports')).toBe(true)
    expect(next.activeByPane[paneKey('reports', 0)]).toBe('tab-reports')
  })

  it('leaves behind no active id pointing at a tab it closed', () => {
    const preset: Preset = { ...NAMED, tabs: [{ pane: 0, ...pricesShape }] }
    const next = applied(ARRANGED, preset)

    const stale = Object.entries(next.activeByPane)
      .filter(([, id]) => id !== undefined)
      .filter(([, id]) => !next.tabs.some((entry) => entry.id === id))

    expect(stale).toEqual([])
  })
})

describe('overwriting (BU-136)', () => {
  it('keeps the name and the code, and takes what is open now', () => {
    // The code especially: it is what anybody who wrote it down will type,
    // so an overwrite that reissued one would break the note on their desk.
    const before = capture(NAMED, ARRANGED.tabs, ARRANGED.activeByPane)
    const after = capture(
      { id: before.id, name: before.name, code: before.code, page: before.page, layout: 'grid' },
      [tab({ id: 'tab-actions', viewKind: 'actions', title: 'Corporate Actions' })],
      {}
    )

    expect(after.id).toBe(before.id)
    expect(after.code).toBe('DE001')
    expect(after.name).toBe('Research')
    expect(after.layout).toBe('grid')
    expect(after.tabs.map((entry) => entry.viewKind)).toEqual(['actions'])
  })
})

describe('the collection', () => {
  it('offers only the page being looked at', () => {
    const mine: Preset = { ...NAMED, tabs: [] }
    const theirs: Preset = { ...NAMED, id: 'preset-2', page: 'reports', tabs: [] }

    expect(presetsFor([mine, theirs], 'data-explorer')).toEqual([mine])
  })

  it('mints ids nothing else has taken', () => {
    const taken: Preset[] = [{ ...NAMED, tabs: [] }]
    expect(newPresetId(taken)).toBe('preset-2')
  })
})

describe('codes', () => {
  it('numbers per page, so one page does not push another along', () => {
    const mine: Preset = { ...NAMED, tabs: [] }
    const theirs: Preset = { ...NAMED, id: 'preset-2', code: 'RP001', page: 'reports', tabs: [] }

    expect(suggestCode('data-explorer', [mine, theirs])).toBe('DE002')
    expect(suggestCode('reports', [mine, theirs])).toBe('RP002')
    expect(suggestCode('beacon-view', [mine, theirs])).toBe('BV001')
  })

  it('is typed into a search field, so it is uppercase and unspaced', () => {
    expect(normaliseCode(' de 001 ')).toBe('DE001')
  })

  it('matches by code or by name, from any page', () => {
    const preset: Preset = { ...NAMED, tabs: [] }

    expect(matchesPreset(preset, 'de00')).toBe(true)
    expect(matchesPreset(preset, 'resea')).toBe(true)
    expect(matchesPreset(preset, 'rp')).toBe(false)
  })
})

describe('migratePresets', () => {
  it('gives presets saved before codes existed one each', () => {
    const stored = {
      presets: [
        { id: 'preset-1', name: 'Research', page: 'data-explorer', layout: 'columns', tabs: [] },
        { id: 'preset-2', name: 'Monitoring', page: 'data-explorer', layout: 'grid', tabs: [] }
      ]
    }

    expect(migratePresets(stored).presets.map((preset) => preset.code)).toEqual(['DE001', 'DE002'])
  })

  it('drops an entry too damaged to restore rather than taking the app down', () => {
    // Bytes off disk, hand-edited or written by a version that did not have
    // these keys. A preset with no page cannot be applied to one.
    const stored = { presets: [{ id: 'preset-1', name: 'Half' }] }
    expect(migratePresets(stored).presets).toEqual([])
  })
})

describe('loading an instrument into an arrangement (BU-122)', () => {
  it('points every loadable tab at it, and leaves the rest alone', () => {
    const linked: WorkspaceState = {
      ...ARRANGED,
      tabs: [
        tab({ id: 'tab-prices', subject: 'CMP001' }),
        tab({
          id: 'tab-charting',
          pane: 1,
          viewKind: 'charting',
          title: 'Charting',
          archetype: 'linked',
          linkSourceId: 'tab-prices'
        }),
        tab({
          id: 'tab-coverage',
          pane: 1,
          viewKind: 'coverage',
          archetype: 'global',
          title: 'Data Coverage'
        })
      ]
    }
    const preset = capture(NAMED, linked.tabs, linked.activeByPane)

    const next = applied(linked, preset, 'CMP002')
    const restored = next.tabs.filter((entry) => entry.page === 'data-explorer')

    expect(restored[0]?.subject).toBe('CMP002')
    // A linked tab follows its source; writing a subject onto it would sever
    // the link the preset just restored.
    expect(restored[1]?.subject).toBeUndefined()
    expect(restored[1]?.linkSourceId).toBe(restored[0]?.id)
    // A global view has no subject to point.
    expect(restored[2]?.subject).toBeUndefined()
  })

  it('counts what a subject could be loaded into, before applying', () => {
    const preset = capture(NAMED, ARRANGED.tabs, ARRANGED.activeByPane)
    expect(loadableTabs(preset)).toBe(3)
    expect(loadableTabs({ ...NAMED, tabs: [] })).toBe(0)
  })

  it('leaves the saved subjects alone when nothing is being loaded', () => {
    const preset = capture(NAMED, ARRANGED.tabs, ARRANGED.activeByPane)
    const next = applied(ARRANGED, preset)
    expect(next.tabs.find((entry) => entry.viewKind === 'prices')?.subject).toBe('CMP001')
  })
})
