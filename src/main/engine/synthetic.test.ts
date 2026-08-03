import { describe, expect, it } from 'vitest'
import { SYNTHETIC_ASSETS, SYNTHETIC_SEED, shouldGenerate } from './synthetic'

const NONE: NodeJS.ProcessEnv = {}

/**
 * The guard is the whole safety story here.
 *
 * Generating a demo store over somebody's real data would be unforgivable and
 * silent — py-beacon auto-loads whatever is at the app-data path, so a wrong
 * `true` here does not fail, it replaces.
 */
describe('shouldGenerate', () => {
  it('generates when there is genuinely nothing', () => {
    expect(shouldGenerate({ path: '/store', exists: false }, NONE)).toBe(true)
  })

  it('never touches an existing store', () => {
    expect(shouldGenerate({ path: '/store', exists: true }, NONE)).toBe(false)
  })

  it('stands aside when the user has named their own source', () => {
    // Set but empty on disk still means "this is mine to fill", not ours.
    const env = { BEACON_DATA_PATH: '/somewhere/else' }
    expect(shouldGenerate({ path: '/store', exists: false }, env)).toBe(false)
  })

  it('ignores a blank BEACON_DATA_PATH, which is not a choice', () => {
    expect(shouldGenerate({ path: '/store', exists: false }, { BEACON_DATA_PATH: '   ' })).toBe(
      true
    )
  })

  it('can be switched off outright', () => {
    const env = { BEACON_NO_SYNTHETIC: '1' }
    expect(shouldGenerate({ path: '/store', exists: false }, env)).toBe(false)
  })
})

describe('generation defaults', () => {
  it('pins the seed so two machines see the same data', () => {
    // BU-35's screenshot diffs depend on this, and it removes a place for
    // "works on mine" to hide. A change here should be deliberate.
    expect(SYNTHETIC_SEED).toBe(42)
  })

  it('asks for the universe size the frames quote', () => {
    expect(SYNTHETIC_ASSETS).toBe(512)
  })
})
