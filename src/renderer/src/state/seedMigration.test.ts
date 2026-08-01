import { describe, expect, it } from 'vitest'
import { addNewSeedTabs } from './tabs.store'
import { emptyWorkspace, openTab } from './tabs.logic'
import { SEED_TABS } from '../views/seed'

const ids = (): string[] => SEED_TABS.map((tab) => tab.id)

describe('addNewSeedTabs', () => {
  it('adds every seed tab an empty workspace is missing', () => {
    const state = addNewSeedTabs(emptyWorkspace())
    expect(state.tabs.map((tab) => tab.id)).toEqual(ids())
  })

  it('adds only what is missing, leaving the rest untouched', () => {
    const before = openTab(emptyWorkspace(), { ...SEED_TABS[0]!, subject: 'MSFT' })
    const after = addNewSeedTabs(before)

    // The user's own subject survives; the tab is not re-created.
    expect(after.tabs.filter((tab) => tab.id === SEED_TABS[0]!.id)).toHaveLength(1)
    expect(after.tabs[0]?.subject).toBe('MSFT')
    expect(after.tabs).toHaveLength(SEED_TABS.length)
  })

  it('is idempotent, so a second run cannot duplicate a tab', () => {
    const once = addNewSeedTabs(emptyWorkspace())
    const twice = addNewSeedTabs(once)
    expect(twice.tabs).toHaveLength(once.tabs.length)
  })

  it('does not mutate the workspace handed in', () => {
    const before = emptyWorkspace()
    addNewSeedTabs(before)
    expect(before.tabs).toHaveLength(0)
  })
})

describe('SEED_TABS', () => {
  it('has unique ids — the migration keys off them', () => {
    expect(new Set(ids()).size).toBe(ids().length)
  })

  it('links only to tabs that exist, so no seeded link starts broken', () => {
    const known = new Set(ids())
    for (const tab of SEED_TABS) {
      if (tab.linkSourceId === undefined) continue
      expect(known.has(tab.linkSourceId)).toBe(true)
    }
  })
})
