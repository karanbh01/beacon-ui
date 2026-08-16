import { describe, expect, it } from 'vitest'
import { HOME_PAGE_ID, SIDEBAR_PAGES } from '../shell/pages'
import { EVEN_SPLIT, layoutFor, migrateChrome, splitFor, splitKey, SINGLE_PANE } from './chrome'

/**
 * Layout is per sidebar page (BU-75). These pin the two things that were
 * global before and are not any more, plus the migration — which runs exactly
 * once per install and is therefore the code most likely to be wrong and
 * never noticed.
 */
describe('layoutFor', () => {
  it('gives an unarranged page a single pane', () => {
    expect(layoutFor({}, 'data-explorer')).toBe(SINGLE_PANE.id)
  })

  it('keeps each page on its own arrangement', () => {
    const byPage = { 'data-explorer': 'columns', 'beacon-view': 'grid' }

    expect(layoutFor(byPage, 'data-explorer')).toBe('columns')
    expect(layoutFor(byPage, 'beacon-view')).toBe('grid')
    // A page nobody has touched is unaffected by either.
    expect(layoutFor(byPage, 'reports')).toBe(SINGLE_PANE.id)
  })
})

describe('splitFor', () => {
  it('is keyed by page AND layout', () => {
    // Data Explorer's main-stack and Beacon View's main-stack are different
    // arrangements of different work, so they cannot share a number.
    const splits = {
      [splitKey('data-explorer', 'main-stack')]: { x: 0.7, y: 0.5 },
      [splitKey('beacon-view', 'main-stack')]: { x: 0.3, y: 0.5 }
    }

    expect(splitFor(splits, 'data-explorer', 'main-stack').x).toBe(0.7)
    expect(splitFor(splits, 'beacon-view', 'main-stack').x).toBe(0.3)
  })

  it('falls back to even for a split nobody has dragged', () => {
    expect(splitFor({}, 'reports', 'columns')).toEqual(EVEN_SPLIT)
  })
})

describe('migrateChrome', () => {
  it('seeds every known page from the old global layout', () => {
    // Someone who chose two columns chose it for the app, and that is what
    // they are looking at. Resetting to single would silently discard a
    // preference on the one launch nobody expects a change.
    const migrated = migrateChrome({ layout: 'columns', splits: {} })

    for (const page of SIDEBAR_PAGES) {
      expect(migrated.layoutByPage[page.id], page.id).toBe('columns')
    }
    expect(migrated.layoutByPage[HOME_PAGE_ID]).toBe('columns')
  })

  it('re-keys the old per-layout splits onto every page', () => {
    const migrated = migrateChrome({
      layout: 'main-stack',
      splits: { 'main-stack': { x: 0.7, y: 0.4 } }
    })

    expect(splitFor(migrated.splits, 'data-explorer', 'main-stack')).toEqual({ x: 0.7, y: 0.4 })
    expect(splitFor(migrated.splits, 'reports', 'main-stack')).toEqual({ x: 0.7, y: 0.4 })
  })

  it('leaves a store that is already per-page alone', () => {
    // Rehydrating a v3 store must not re-seed and flatten what the user has
    // since arranged per page.
    const already = {
      layoutByPage: { 'data-explorer': 'grid' },
      splits: { [splitKey('data-explorer', 'grid')]: { x: 0.6, y: 0.6 } }
    }

    expect(migrateChrome(already)).toEqual(already)
  })

  it('survives a store with nothing in it', () => {
    const migrated = migrateChrome({})
    expect(migrated.layoutByPage['data-explorer']).toBe(SINGLE_PANE.id)
    expect(migrated.splits).toEqual({})
  })
})
