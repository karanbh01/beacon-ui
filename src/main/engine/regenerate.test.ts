import { describe, expect, it } from 'vitest'
import { shouldGenerate } from './synthetic'

/**
 * `regenerate` deliberately does NOT go through `shouldGenerate` (BU-107).
 *
 * That guard answers "may we generate unasked", and its whole point is to
 * refuse when a store exists. Regenerating is the user saying replace it, so
 * routing through the guard would make the button do nothing — the exact
 * failure this documents against.
 */
describe('the generate guard, and why regenerate bypasses it', () => {
  it('refuses an existing store, which is why a button had to be added', () => {
    expect(shouldGenerate({ path: '/store', exists: true }, {})).toBe(false)
  })

  it('refuses a store the user named, which regenerate must also refuse', () => {
    // The one rule both paths share: BEACON_DATA_PATH means the data is
    // theirs. `Engine.regenerate` throws rather than deleting it.
    expect(shouldGenerate({ path: '/store', exists: false }, { BEACON_DATA_PATH: '/mine' })).toBe(
      false
    )
  })
})
