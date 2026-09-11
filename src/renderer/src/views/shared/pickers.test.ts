import { describe, expect, it } from 'vitest'
import { catalogueDisabled, cataloguePlaceholder } from './pickers'

const LOADING = { isPending: true, isError: false }
const FAILED = { isPending: false, isError: true }
const LOADED = { isPending: false, isError: false }

describe('a picker over a catalogue (BU-181)', () => {
  it('says the catalogue is empty only when it really is', () => {
    expect(cataloguePlaceholder(LOADED, 'No universes')).toBe('No universes')
  })

  it('never reports a failure as an absence', () => {
    /*
     * The whole point. "No universes" to someone whose universes are all
     * still there — and unreachable because one document the server cannot
     * read took the entire listing down (py-beacon #187) — is true of the
     * wrong thing.
     */
    expect(cataloguePlaceholder(FAILED, 'No universes')).toBe('Catalogue unavailable')
    expect(cataloguePlaceholder(FAILED, 'No indices')).toBe('Catalogue unavailable')
  })

  it('distinguishes not-yet from neither of the others', () => {
    expect(cataloguePlaceholder(LOADING, 'No universes')).toBe('Loading…')
  })

  it('offers nothing to pick in any of the three, whatever it says', () => {
    expect(catalogueDisabled(LOADING, 0)).toBe(true)
    expect(catalogueDisabled(FAILED, 0)).toBe(true)
    expect(catalogueDisabled(LOADED, 0)).toBe(true)
    expect(catalogueDisabled(LOADED, 3)).toBe(false)
  })

  it('stays disabled on a failure even if stale rows are still in hand', () => {
    // react-query keeps the last good data through a refetch failure. The
    // rows on screen may no longer exist, so choosing one is not offered.
    expect(catalogueDisabled(FAILED, 3)).toBe(true)
  })
})
