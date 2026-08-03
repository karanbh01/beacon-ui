import { beforeEach, describe, expect, it } from 'vitest'
import { clearViews, getView, registeredViewKinds, viewsForPage } from '../shell/viewRegistry'
import { SIDEBAR_PAGES } from '../shell/pages'
import { registerPlaceholderViews } from './register'

beforeEach(() => {
  clearViews()
  registerPlaceholderViews()
})

describe('the view registry', () => {
  it('has a view for every kind a page can open', () => {
    // Was "every kind the seed opens" until BU-59 removed the seeds. Same
    // guarantee, sourced from the registry itself: an option in the new-tab
    // menu that renders MissingView is the same failure, now reachable by a
    // click rather than on launch.
    const offered = SIDEBAR_PAGES.flatMap((page) => viewsForPage(page.id))

    expect(offered.length).toBeGreaterThan(20)
    for (const option of offered) {
      expect(getView(option.viewKind), `no view for ${option.viewKind}`).toBeDefined()
    }
  })

  it('gives every page something to open', () => {
    // An empty page with an empty `+` menu is a dead end, and BU-59 makes
    // every page start empty.
    for (const page of SIDEBAR_PAGES) {
      expect(viewsForPage(page.id).length, `${page.id} offers nothing`).toBeGreaterThan(0)
    }
  })

  it('never lets a pending placeholder overwrite a finished view', () => {
    // This happened: a stale name in the pending list ran last and replaced
    // three live panes with "not built yet". Nothing failed — the app
    // compiled and the tests passed — and only a screenshot caught it.
    const live = [
      'futures-pricer',
      'trs-pricer',
      'term-structure',
      'constraint-set',
      'frontier',
      'factor-exposures',
      'risk-model'
    ]

    for (const kind of live) {
      expect(getView(kind)?.name, `${kind} fell back to the placeholder`).not.toBe('GenericView')
    }
  })

  it('registers each kind exactly once', () => {
    const kinds = registeredViewKinds()
    expect(new Set(kinds).size).toBe(kinds.length)
  })
})
