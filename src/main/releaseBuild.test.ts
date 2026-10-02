import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false } }))

const { isReleaseBuild } = await import('./releaseBuild')

describe('whether this is a release build (BU-209)', () => {
  it('is whatever electron-builder packaged', () => {
    expect(isReleaseBuild(true, {})).toBe(true)
    expect(isReleaseBuild(false, {})).toBe(false)
  })

  it('can be asked for unpackaged, so the e2e suite can see what a release hides', () => {
    expect(isReleaseBuild(false, { BEACON_RELEASE_BUILD: '1' })).toBe(true)
  })

  it('cannot be switched off in a packaged build', () => {
    // The override only ever hides: nothing it sets reveals withheld parts.
    expect(isReleaseBuild(true, { BEACON_RELEASE_BUILD: '0' })).toBe(true)
  })
})
