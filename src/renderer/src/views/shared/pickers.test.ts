import { describe, expect, it } from 'vitest'
import { catalogueDisabled, cataloguePlaceholder, describeSkipped } from './pickers'

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

describe('an incomplete listing (BU-185)', () => {
  it('says nothing when nothing was skipped', () => {
    // The common case. "0 could not be read" is noise that trains a reader
    // to stop looking at the line.
    expect(describeSkipped({ skipped: 0 })).toBeUndefined()
    expect(describeSkipped(undefined)).toBeUndefined()
  })

  it('says how many are missing, because a short list looks complete', () => {
    expect(describeSkipped({ skipped: 3 })).toContain('3 could not be read')
    expect(describeSkipped({ skipped: 1 })).toContain('1 could not be read')
  })

  it('agrees with itself about one', () => {
    expect(describeSkipped({ skipped: 1 })).not.toContain('are missing')
    expect(describeSkipped({ skipped: 2 })).toContain('are missing')
  })
})

describe('why a listing is short (BU-212, py-beacon #214)', () => {
  /*
   * The count used to be all there was, and it meant three things with
   * OPPOSITE remedies: a damaged file, a document written by a newer
   * py-beacon than the one running, and one this build's model rejects.
   * Only the first is bad data. The second is two machines updated
   * separately, and nothing is wrong with the file at all.
   */
  const causes = (from_newer_build: number, unparseable: number, unrecognised: number) => ({
    skipped: from_newer_build + unparseable + unrecognised,
    skipped_causes: { from_newer_build, unparseable, unrecognised }
  })

  it('sends a newer document to an engine upgrade, not to a backup', () => {
    const said = describeSkipped(causes(2, 0, 0))
    expect(said).toContain('written by a newer py-beacon')
    expect(said).toContain('upgrade the engine')
    expect(said).not.toContain('damaged')
  })

  it('sends a damaged one to restoring the file', () => {
    const said = describeSkipped(causes(0, 1, 0))
    expect(said).toContain('damaged')
    expect(said).toContain('restore or remove the file')
  })

  it('sends a rejected shape to the server log, which names the field', () => {
    expect(describeSkipped(causes(0, 0, 1))).toContain('the server log names the field')
  })

  it('does not repeat the count when there is only one cause', () => {
    // "1 is missing: 1 damaged" says the same number twice.
    expect(describeSkipped(causes(0, 1, 0))).toBe(
      '1 is missing from this list — damaged (restore or remove the file)'
    )
  })

  it('counts each cause when there are several, newest-build first', () => {
    // The newer-build case leads: it is the commonest on two machines, and
    // its remedy is the one that needs no investigation.
    expect(describeSkipped(causes(2, 1, 0))).toBe(
      '3 are missing from this list: 2 written by a newer py-beacon (upgrade the engine), ' +
        '1 damaged (restore or remove the file)'
    )
  })

  it('keeps the old wording, exactly, for an engine too old to say why', () => {
    /*
     * An engine before 0.1.0 sends the bare count, and Karan updates the two
     * repos separately. Naming the likeliest cause here would be a guess, so
     * this says only what the old engine said.
     */
    expect(describeSkipped({ skipped: 2, skipped_causes: null })).toBe(
      '2 could not be read and are missing from this list'
    )
  })
})
