import { describe, expect, it } from 'vitest'
import {
  activeTab,
  closeTab,
  dependants,
  emptyWorkspace,
  findTab,
  linkTab,
  moveTab,
  openOrRetarget,
  openTab,
  pinTab,
  reopenTab,
  resolveSubject,
  selectTab,
  setDirty,
  setSubject,
  severLink,
  tabsForPage,
  tabsForPane,
  visiblePane,
  type OpenTabInput
} from './tabs.logic'
import type { WorkspaceState } from './tabs.types'

const PRICES: OpenTabInput = {
  id: 'prices',
  page: 'data-explorer',
  viewKind: 'prices',
  archetype: 'query',
  title: 'Prices',
  subject: 'AAPL'
}

const CHARTING: OpenTabInput = {
  id: 'charting',
  page: 'data-explorer',
  viewKind: 'charting',
  archetype: 'linked',
  title: 'Charting',
  linkSourceId: 'prices'
}

const DOC: OpenTabInput = {
  id: 'tech10',
  page: 'strategy-builder',
  viewKind: 'index-definition',
  archetype: 'document',
  title: 'TECH10'
}

function workspace(...inputs: OpenTabInput[]): WorkspaceState {
  return inputs.reduce(openTab, emptyWorkspace())
}

describe('open and select', () => {
  it('activates a newly opened tab on its page', () => {
    const state = workspace(PRICES)
    expect(activeTab(state, 'data-explorer')?.id).toBe('prices')
  })

  it('keeps tabs partitioned per page', () => {
    const state = workspace(PRICES, DOC)

    expect(tabsForPage(state, 'data-explorer').map((t) => t.id)).toEqual(['prices'])
    expect(tabsForPage(state, 'strategy-builder').map((t) => t.id)).toEqual(['tech10'])
  })

  it('tracks an active tab per page independently', () => {
    const state = workspace(PRICES, DOC)

    expect(activeTab(state, 'data-explorer')?.id).toBe('prices')
    expect(activeTab(state, 'strategy-builder')?.id).toBe('tech10')
  })

  it('ignores selection of an unknown tab', () => {
    const state = workspace(PRICES)
    expect(selectTab(state, 'nope')).toBe(state)
  })
})

describe('subject resolution', () => {
  it('reads a query tab from its own subject', () => {
    const state = workspace(PRICES)
    expect(resolveSubject(state, findTab(state, 'prices')!)).toBe('AAPL')
  })

  it('resolves a linked tab through its source, live', () => {
    let state = workspace(PRICES, CHARTING)
    expect(resolveSubject(state, findTab(state, 'charting')!)).toBe('AAPL')

    state = setSubject(state, 'prices', 'NVDA')

    // The whole point: no copy was stored, so the follower moved with it.
    expect(resolveSubject(state, findTab(state, 'charting')!)).toBe('NVDA')
  })

  it('reads a pinned tab from its document', () => {
    let state = workspace({ ...PRICES, id: 'frontier', archetype: 'query' })
    state = pinTab(state, 'frontier', 'TECH10')

    expect(resolveSubject(state, findTab(state, 'frontier')!)).toBe('TECH10')
  })

  it('resolves to undefined rather than throwing on a dangling link', () => {
    const state = workspace({ ...CHARTING, linkSourceId: 'ghost' })
    expect(resolveSubject(state, findTab(state, 'charting')!)).toBeUndefined()
  })
})

describe('setSubject', () => {
  it('updates a query tab', () => {
    const state = setSubject(workspace(PRICES), 'prices', 'MSFT')
    expect(findTab(state, 'prices')?.subject).toBe('MSFT')
  })

  it('refuses on a pinned tab — no query bar exists to type in', () => {
    let state = workspace(PRICES)
    state = pinTab(state, 'prices', 'TECH10')

    const after = setSubject(state, 'prices', 'MSFT')

    expect(after).toBe(state)
    expect(resolveSubject(after, findTab(after, 'prices')!)).toBe('TECH10')
  })

  it('refuses on a linked tab — the subject belongs to the source', () => {
    const state = workspace(PRICES, CHARTING)
    expect(setSubject(state, 'charting', 'MSFT')).toBe(state)
  })
})

describe('severing (taxonomy 2)', () => {
  it('turns a linked tab into an independent query view', () => {
    const state = severLink(workspace(PRICES, CHARTING), 'charting')
    const charting = findTab(state, 'charting')!

    expect(charting.archetype).toBe('query')
    expect(charting.linkSourceId).toBeUndefined()
  })

  it('keeps the subject it was showing at the moment of the break', () => {
    let state = workspace(PRICES, CHARTING)
    state = setSubject(state, 'prices', 'NVDA')
    state = severLink(state, 'charting')

    expect(findTab(state, 'charting')?.subject).toBe('NVDA')
  })

  it('stops following the source afterwards', () => {
    let state = severLink(workspace(PRICES, CHARTING), 'charting')
    // Severed at AAPL; the source then moves on without it.
    state = setSubject(state, 'prices', 'MSFT')

    expect(resolveSubject(state, findTab(state, 'charting')!)).toBe('AAPL')
    expect(resolveSubject(state, findTab(state, 'prices')!)).toBe('MSFT')
  })

  it('is a no-op on a tab that is not linked', () => {
    const state = workspace(PRICES)
    expect(severLink(state, 'prices')).toBe(state)
  })
})

/** Charting before it is linked — no linkSourceId at all, not undefined. */
const CHARTING_UNLINKED: OpenTabInput = {
  id: 'charting',
  page: 'data-explorer',
  viewKind: 'charting',
  archetype: 'query',
  title: 'Charting'
}

describe('linking', () => {
  it('makes a query tab follow another', () => {
    let state = workspace(PRICES, CHARTING_UNLINKED)
    state = linkTab(state, 'charting', 'prices')

    expect(findTab(state, 'charting')?.archetype).toBe('linked')
    expect(resolveSubject(state, findTab(state, 'charting')!)).toBe('AAPL')
  })

  it('refuses to let a tab follow itself', () => {
    const state = workspace(PRICES)
    expect(linkTab(state, 'prices', 'prices')).toBe(state)
  })

  it('refuses to chain links, which the taxonomy does not define', () => {
    const state = workspace(PRICES, CHARTING, { ...DOC, id: 'third', archetype: 'query' })
    expect(linkTab(state, 'third', 'charting')).toBe(state)
  })

  it('ignores an unknown source', () => {
    const state = workspace(PRICES)
    expect(linkTab(state, 'prices', 'ghost')).toBe(state)
  })
})

describe('pinning', () => {
  it('binds a view to a document', () => {
    const state = pinTab(workspace(PRICES), 'prices', 'TECH10')
    const tab = findTab(state, 'prices')!

    expect(tab.archetype).toBe('pinned')
    expect(tab.pinnedDoc).toBe('TECH10')
  })

  it('changes document only by re-pinning', () => {
    let state = pinTab(workspace(PRICES), 'prices', 'TECH10')
    state = pinTab(state, 'prices', 'GLOBAL-EQ')

    expect(findTab(state, 'prices')?.pinnedDoc).toBe('GLOBAL-EQ')
  })
})

describe('dirty lifecycle', () => {
  it('marks and clears a document', () => {
    let state = setDirty(workspace(DOC), 'tech10', true)
    expect(findTab(state, 'tech10')?.dirty).toBe(true)

    state = setDirty(state, 'tech10', false)
    expect(findTab(state, 'tech10')?.dirty).toBe(false)
  })

  it('refuses on non-documents — only documents own dirty state', () => {
    const state = workspace(PRICES)
    expect(setDirty(state, 'prices', true)).toBe(state)
  })

  it('opens clean', () => {
    expect(findTab(workspace(DOC), 'tech10')?.dirty).toBe(false)
  })
})

describe('close', () => {
  it('removes the tab', () => {
    const state = closeTab(workspace(PRICES), 'prices')
    expect(findTab(state, 'prices')).toBeUndefined()
  })

  it('severs anything that was following it, rather than dangling', () => {
    const state = closeTab(workspace(PRICES, CHARTING), 'prices')
    const charting = findTab(state, 'charting')!

    expect(charting.archetype).toBe('query')
    // It keeps the last subject it was showing, not nothing.
    expect(charting.subject).toBe('AAPL')
    expect(dependants(state, 'prices')).toHaveLength(0)
  })

  it('activates a neighbour when the active tab closes', () => {
    const state = closeTab(workspace(PRICES, CHARTING), 'prices')
    expect(activeTab(state, 'data-explorer')?.id).toBe('charting')
  })

  it('leaves the active tab alone when a different one closes', () => {
    let state = workspace(PRICES, CHARTING)
    state = selectTab(state, 'prices')
    state = closeTab(state, 'charting')

    expect(activeTab(state, 'data-explorer')?.id).toBe('prices')
  })

  it('leaves the page with no active tab when the last one closes', () => {
    const state = closeTab(workspace(PRICES), 'prices')
    expect(activeTab(state, 'data-explorer')).toBeUndefined()
  })
})

describe('reopen', () => {
  it('restores the most recently closed tab', () => {
    let state = closeTab(workspace(PRICES), 'prices')
    state = reopenTab(state)

    expect(findTab(state, 'prices')?.subject).toBe('AAPL')
  })

  it('restores it to the slot it occupied', () => {
    let state = workspace(PRICES, CHARTING, { ...DOC, id: 'third', page: 'data-explorer' })
    state = closeTab(state, 'charting')
    state = reopenTab(state)

    expect(tabsForPage(state, 'data-explorer').map((t) => t.id)).toEqual([
      'prices',
      'charting',
      'third'
    ])
  })

  it('reopens in most-recently-closed order', () => {
    let state = workspace(PRICES, CHARTING)
    state = closeTab(state, 'prices')
    state = closeTab(state, 'charting')

    state = reopenTab(state)
    expect(findTab(state, 'charting')).toBeDefined()
    expect(findTab(state, 'prices')).toBeUndefined()

    state = reopenTab(state)
    expect(findTab(state, 'prices')).toBeDefined()
  })

  it('does nothing when nothing has been closed', () => {
    const state = workspace(PRICES)
    expect(reopenTab(state)).toBe(state)
  })

  it('restores dirty state, so closing is not a silent save', () => {
    let state = setDirty(workspace(DOC), 'tech10', true)
    state = closeTab(state, 'tech10')
    state = reopenTab(state)

    expect(findTab(state, 'tech10')?.dirty).toBe(true)
  })
})

describe('immutability', () => {
  it('never mutates the state handed in', () => {
    const before = workspace(PRICES, CHARTING)
    const snapshot = JSON.stringify(before)

    setSubject(before, 'prices', 'MSFT')
    severLink(before, 'charting')
    closeTab(before, 'prices')
    setDirty(before, 'prices', true)

    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('openOrRetarget (cross-view jump)', () => {
  const JUMP = {
    page: 'data-explorer',
    viewKind: 'prices',
    title: 'Prices',
    subject: 'MSFT'
  }

  it('retargets the query tab already open instead of opening a second one', () => {
    const state = openOrRetarget(workspace(PRICES), JUMP)

    expect(tabsForPage(state, 'data-explorer')).toHaveLength(1)
    expect(findTab(state, 'prices')?.subject).toBe('MSFT')
  })

  it('brings the retargeted tab to the front', () => {
    const state = openOrRetarget(workspace(DOC, PRICES), JUMP)
    expect(activeTab(state, 'data-explorer')?.id).toBe('prices')
  })

  it('drags linked tabs along, which is the point of a link', () => {
    const state = openOrRetarget(workspace(PRICES, CHARTING), JUMP)
    const charting = findTab(state, 'charting')

    expect(charting).toBeDefined()
    expect(resolveSubject(state, charting!)).toBe('MSFT')
  })

  it('opens a tab when the page has none of that view', () => {
    const state = openOrRetarget(emptyWorkspace(), JUMP)

    expect(tabsForPage(state, 'data-explorer')).toHaveLength(1)
    expect(activeTab(state, 'data-explorer')?.subject).toBe('MSFT')
  })

  it('does not hijack a pinned or linked tab of the same kind', () => {
    // Neither can take a subject — pinned has no query bar and linked would
    // sever — so a jump must open its own tab rather than break theirs.
    const pinned = workspace({ ...PRICES, id: 'pinned', archetype: 'pinned', pinnedDoc: 'TECH10' })
    const state = openOrRetarget(pinned, JUMP)

    expect(tabsForPage(state, 'data-explorer')).toHaveLength(2)
    expect(findTab(state, 'pinned')?.pinnedDoc).toBe('TECH10')
  })

  it('finds the tab on the requested page only', () => {
    const elsewhere = workspace({ ...PRICES, id: 'other', page: 'beacon-view' })
    const state = openOrRetarget(elsewhere, JUMP)

    expect(findTab(state, 'other')?.subject).toBe('AAPL')
    expect(tabsForPage(state, 'data-explorer')).toHaveLength(1)
  })
})

describe('panes (BU-55)', () => {
  const FOUR = 4

  it('opens into the pane the + was clicked in', () => {
    const state = openTab(emptyWorkspace(), { ...PRICES, pane: 2 })

    expect(findTab(state, 'prices')?.pane).toBe(2)
    expect(activeTab(state, 'data-explorer', 2, FOUR)?.id).toBe('prices')
    expect(activeTab(state, 'data-explorer', 0, FOUR)).toBeUndefined()
  })

  it('keeps each pane its own strip', () => {
    const state = workspace({ ...PRICES, pane: 0 }, { ...CHARTING, pane: 1 })

    expect(tabsForPane(state, 'data-explorer', 0, FOUR).map((t) => t.id)).toEqual(['prices'])
    expect(tabsForPane(state, 'data-explorer', 1, FOUR).map((t) => t.id)).toEqual(['charting'])
    // The + menu still gates on the page, so a linked view can follow a
    // source in the pane next door.
    expect(tabsForPage(state, 'data-explorer')).toHaveLength(2)
  })

  it('folds stray panes into the last visible one rather than losing them', () => {
    const state = workspace({ ...PRICES, pane: 0 }, { ...CHARTING, pane: 3 })

    expect(visiblePane(findTab(state, 'charting')!, 1)).toBe(0)
    expect(tabsForPane(state, 'data-explorer', 0, 1).map((t) => t.id)).toEqual([
      'prices',
      'charting'
    ])
  })

  it('remembers the arrangement across a collapse and a re-split', () => {
    // The reason `pane` is stored rather than clamped: peeking at one pane
    // full-screen must not flatten a workspace someone arranged.
    const state = workspace({ ...PRICES, pane: 0 }, { ...CHARTING, pane: 3 })

    expect(tabsForPane(state, 'data-explorer', 0, 1)).toHaveLength(2)
    expect(tabsForPane(state, 'data-explorer', 3, FOUR).map((t) => t.id)).toEqual(['charting'])
  })

  it('shows a folded-in tab rather than an empty pane', () => {
    // Nothing was ever active in pane 0, but it now holds a tab.
    const state = workspace({ ...CHARTING, pane: 3 })
    expect(activeTab(state, 'data-explorer', 0, 1)?.id).toBe('charting')
  })
})

describe('moveTab (drag between panes)', () => {
  const FOUR = 4

  it('moves rather than copies', () => {
    let state = workspace({ ...PRICES, pane: 0 }, { ...CHARTING, pane: 0 })
    state = moveTab(state, 'charting', 1, 0, FOUR)

    expect(tabsForPane(state, 'data-explorer', 0, FOUR).map((t) => t.id)).toEqual(['prices'])
    expect(tabsForPane(state, 'data-explorer', 1, FOUR).map((t) => t.id)).toEqual(['charting'])
    expect(tabsForPage(state, 'data-explorer')).toHaveLength(2)
  })

  it('activates the tab in the pane that received it', () => {
    let state = workspace({ ...PRICES, pane: 0 }, { ...CHARTING, pane: 0 })
    state = moveTab(state, 'charting', 2, 0, FOUR)

    expect(activeTab(state, 'data-explorer', 2, FOUR)?.id).toBe('charting')
    // And the pane it left falls back to what is still there.
    expect(activeTab(state, 'data-explorer', 0, FOUR)?.id).toBe('prices')
  })

  it('drops at the requested position within the destination strip', () => {
    const third: OpenTabInput = { ...DOC, id: 'third', page: 'data-explorer', pane: 1 }
    let state = workspace({ ...PRICES, pane: 1 }, third, { ...CHARTING, pane: 0 })
    state = moveTab(state, 'charting', 1, 1, FOUR)

    expect(tabsForPane(state, 'data-explorer', 1, FOUR).map((t) => t.id)).toEqual([
      'prices',
      'charting',
      'third'
    ])
  })

  it('drops at the end when the index is past the last tab', () => {
    let state = workspace({ ...PRICES, pane: 1 }, { ...CHARTING, pane: 0 })
    state = moveTab(state, 'charting', 1, 9, FOUR)

    expect(tabsForPane(state, 'data-explorer', 1, FOUR).map((t) => t.id)).toEqual([
      'prices',
      'charting'
    ])
  })

  it('does NOT sever a link, because a link is by id and not by proximity', () => {
    // The case worth pinning: dragging a follower away from its source looks
    // like it should break the link and must not. Taxonomy §1.
    let state = workspace({ ...PRICES, pane: 0 }, { ...CHARTING, pane: 0 })
    state = moveTab(state, 'charting', 3, 0, FOUR)

    const charting = findTab(state, 'charting')!
    expect(charting.archetype).toBe('linked')
    expect(charting.linkSourceId).toBe('prices')
    expect(resolveSubject(state, charting)).toBe('AAPL')
  })

  it('follows the source when it is the SOURCE that was dragged away', () => {
    let state = workspace({ ...PRICES, pane: 0 }, { ...CHARTING, pane: 1 })
    state = moveTab(state, 'prices', 3, 0, FOUR)
    state = setSubject(state, 'prices', 'MSFT')

    expect(resolveSubject(state, findTab(state, 'charting')!)).toBe('MSFT')
  })

  it('ignores a drop carrying an id that no longer exists', () => {
    const state = workspace(PRICES)
    expect(moveTab(state, 'ghost', 1, 0, FOUR)).toBe(state)
  })
})

describe('closing within a pane', () => {
  const FOUR = 4

  it('falls back to a neighbour in the same pane, not another one', () => {
    const second: OpenTabInput = { ...DOC, id: 'second', page: 'data-explorer', pane: 0 }
    let state = workspace({ ...PRICES, pane: 0 }, second, { ...CHARTING, pane: 1 })
    state = closeTab(state, 'prices', 0, FOUR)

    expect(activeTab(state, 'data-explorer', 0, FOUR)?.id).toBe('second')
    // Pane 1 was not touched.
    expect(activeTab(state, 'data-explorer', 1, FOUR)?.id).toBe('charting')
  })

  it('leaves the pane empty rather than collapsing the layout', () => {
    let state = workspace({ ...PRICES, pane: 1 })
    state = closeTab(state, 'prices', 1, FOUR)

    expect(activeTab(state, 'data-explorer', 1, FOUR)).toBeUndefined()
    expect(tabsForPane(state, 'data-explorer', 1, FOUR)).toEqual([])
  })
})
