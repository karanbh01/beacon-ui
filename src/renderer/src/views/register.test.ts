import { beforeEach, describe, expect, it } from 'vitest'
import { clearViews, getView, registeredViewKinds } from '../shell/viewRegistry'
import { SEED_TABS } from './seed'
import { registerPlaceholderViews } from './register'

beforeEach(() => {
  clearViews()
  registerPlaceholderViews()
})

describe('the view registry', () => {
  it('has a view for every kind the seed opens', () => {
    // A seeded tab pointing at an unregistered kind renders MissingView, and
    // the app looks broken on first launch.
    for (const tab of SEED_TABS) {
      expect(getView(tab.viewKind), `no view registered for ${tab.viewKind}`).toBeDefined()
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
