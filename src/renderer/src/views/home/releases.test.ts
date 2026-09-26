import { describe, expect, it } from 'vitest'
import appChangelog from '../../../../../CHANGELOG.md?raw'
import engineChangelog from '../../../../../py-beacon.CHANGELOG.md?raw'
import { isRunning, mergeReleases, parseChangelog } from './releases'

/**
 * The home page's release list (BU-219), read from the two changelogs. The
 * list it replaced was invented; these pin that what shows is what the
 * files say.
 */

const ENGINE = `# Changelog

## [Unreleased]

## [0.2.0] - 2026-09-26

### Added

- Named data stores.
- Refresh a store.

### Fixed

- Splits no longer move the level.

## [0.1.0] - 2026-09-24

The first release.

### Added

- Everything.
`

const APP = `# Changelog

## [Unreleased]

The first release, to be 0.1.0.

### Added

- Data Explorer.
`

describe('reading a changelog', () => {
  it('takes each release with its date and sections', () => {
    const [unreleased, second, first] = parseChangelog(ENGINE, 'py-beacon')

    expect(unreleased?.version).toBe('unreleased')
    expect(second).toMatchObject({ version: '0.2.0', date: '2026-09-26' })
    expect(second?.sections.map((section) => section.heading)).toEqual(['Added', 'Fixed'])
    expect(first?.sections[0]?.items).toEqual(['Everything.'])
  })

  it('summarises by the release’s own opening line, or by what it counts', () => {
    const [, second, first] = parseChangelog(ENGINE, 'py-beacon')
    expect(first?.summary).toBe('The first release.')
    expect(second?.summary).toBe('2 added · 1 fixed')
  })
})

describe('the list the home page shows', () => {
  const list = mergeReleases(parseChangelog(APP, 'Beacon'), parseChangelog(ENGINE, 'py-beacon'))

  it('interleaves both products, newest first, with the app’s coming work on top', () => {
    expect(list.map((release) => `${release.product} ${release.version}`)).toEqual([
      'Beacon unreleased',
      'py-beacon 0.2.0',
      'py-beacon 0.1.0'
    ])
  })

  it('leaves out the engine’s unreleased work, which no running engine reports', () => {
    const engineUnreleased = parseChangelog(
      `## [Unreleased]\n\n### Added\n\n- Soon.\n`,
      'py-beacon'
    )
    expect(mergeReleases(engineUnreleased)).toEqual([])
  })

  it('marks as current only the versions actually running', () => {
    const running = { app: '0.0.1', engine: '0.2.0' }
    const current = list.filter((release) => isRunning(release, running))
    expect(current.map((release) => `${release.product} ${release.version}`)).toEqual([
      'py-beacon 0.2.0'
    ])
  })

  it('marks nothing current when the versions are not known yet', () => {
    expect(list.some((release) => isRunning(release, {}))).toBe(false)
  })
})

describe('the changelogs the app ships', () => {
  /*
   * The real files, parsed as the home page parses them. A heading written
   * the wrong way — a missing bracket, a date without its dash — would drop
   * a release from the page without any error, so the shape is pinned here.
   */
  it('lists py-beacon’s released versions', () => {
    const versions = parseChangelog(engineChangelog, 'py-beacon').map((release) => release.version)
    expect(versions).toContain('0.1.0')
    expect(versions).toContain('0.1.1')
  })

  it('has the app’s own entry, with something in it', () => {
    const releases = mergeReleases(parseChangelog(appChangelog, 'Beacon'))
    expect(releases.length).toBeGreaterThan(0)
  })
})
