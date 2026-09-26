/**
 * The releases the home page lists: Beacon's and py-beacon's (BU-219).
 *
 * Both projects keep a changelog in the Keep a Changelog format, and both are
 * read from the markdown itself rather than restated here. The list this
 * replaced was two invented entries from the Figma frame, one of them marked
 * "current", which was true of neither the app nor the engine.
 */

export type Product = 'Beacon' | 'py-beacon'

export interface ReleaseSection {
  /** "Added", "Changed", "Fixed" … as the changelog heads them. */
  heading: string
  items: string[]
}

export interface Release {
  product: Product
  /** "0.2.0", or "unreleased" for what is in the build but not yet released. */
  version: string
  /** YYYY-MM-DD; absent for unreleased work. */
  date?: string
  /** The release's own opening line where it has one, or what it counts. */
  summary: string
  sections: ReleaseSection[]
}

const RELEASE_HEADING = /^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/
const SECTION_HEADING = /^### (.+)/
const BULLET = /^- (.+)/

/** One changelog's releases, newest first as the file keeps them. */
export function parseChangelog(markdown: string, product: Product): Release[] {
  const releases: Release[] = []
  let intro: string[] = []

  for (const line of markdown.split(/\r?\n/)) {
    const release = RELEASE_HEADING.exec(line)
    if (release !== null) {
      finish(releases.at(-1), intro)
      intro = []
      releases.push(startRelease(product, release[1] ?? '', release[2]))
      continue
    }
    const current = releases.at(-1)
    if (current !== undefined) intro = readLine(current, line, intro)
  }
  finish(releases.at(-1), intro)

  return releases
}

function startRelease(product: Product, version: string, date: string | undefined): Release {
  const unreleased = version.toLowerCase() === 'unreleased'
  return {
    product,
    version: unreleased ? 'unreleased' : version,
    ...(date === undefined ? {} : { date }),
    summary: '',
    sections: []
  }
}

/** Fold one line into the release; returns the intro gathered so far. */
function readLine(release: Release, line: string, intro: string[]): string[] {
  const heading = SECTION_HEADING.exec(line)
  if (heading !== null) {
    release.sections.push({ heading: heading[1] ?? '', items: [] })
    return intro
  }

  const section = release.sections.at(-1)
  const bullet = BULLET.exec(line)
  if (section !== undefined && bullet !== null) section.items.push(bullet[1] ?? '')
  // Prose before the first section is the release's own summary.
  if (section === undefined && line.trim() !== '') return [...intro, line.trim()]
  return intro
}

function finish(release: Release | undefined, intro: readonly string[]): void {
  if (release === undefined) return
  release.summary = intro.length > 0 ? intro.join(' ') : counted(release.sections)
}

/** "9 added · 6 changed · 5 fixed", for a release with no opening line. */
function counted(sections: readonly ReleaseSection[]): string {
  return sections
    .filter((section) => section.items.length > 0)
    .map((section) => `${String(section.items.length)} ${section.heading.toLowerCase()}`)
    .join(' · ')
}

/**
 * Both products' releases in one list, newest first.
 *
 * Unreleased work is listed for the app only: it is what this build carries.
 * The engine's is not what any engine reports running, and the running
 * engine is the one the list has to be true to. An empty section of either
 * says nothing and is dropped.
 */
export function mergeReleases(...lists: readonly (readonly Release[])[]): Release[] {
  const shown = lists
    .flat()
    .filter((release) => release.sections.some((section) => section.items.length > 0))
    .filter((release) => release.version !== 'unreleased' || release.product === 'Beacon')

  return shown.sort((a, b) => dateOf(b).localeCompare(dateOf(a)))
}

/** Unreleased sorts above every dated release. */
function dateOf(release: Release): string {
  return release.date ?? '9999-99-99'
}

/**
 * Whether this release is the one running. The engine's version comes from
 * /health, the app's from its own package; either may be unknown.
 */
export function isRunning(
  release: Release,
  running: { app?: string | undefined; engine?: string | undefined }
): boolean {
  const version = release.product === 'Beacon' ? running.app : running.engine
  return version !== undefined && release.version === version
}
