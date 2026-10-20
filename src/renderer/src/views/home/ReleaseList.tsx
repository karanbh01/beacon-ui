import { useLayoutEffect, useMemo, useRef, type ReactElement, type ReactNode } from 'react'
import appChangelog from '../../../../../CHANGELOG.md?raw'
import engineChangelog from '../../../../../py-beacon.CHANGELOG.md?raw'
import { StatusPill } from '@/components/Badge/Badge'
import {
  fromEngine,
  isRunning,
  latestCount,
  latestFirst,
  mergeReleases,
  parseChangelog,
  type EngineRelease,
  type Release
} from './releases'

/**
 * Read once, at load: both files are bundled with the build. py-beacon's
 * copy is made by `spec:refresh`, from the release the client was generated
 * against, and stands in until the running engine says what it is.
 */
const APP_RELEASES = parseChangelog(appChangelog, 'Beacon')
const BUNDLED_ENGINE = parseChangelog(engineChangelog, 'py-beacon')

export interface ReleaseListProps {
  /** What is running, so `current` is true of something (BU-219). */
  running: { app?: string | undefined; engine?: string | undefined }
  /** The running engine's own releases (GET /changelog), once it answers. */
  engine?: readonly EngineRelease[] | undefined
  /**
   * As Home shows them: each product's newest release, then older ones for
   * as long as they fit the room the list is given. The rest are in its pop-up.
   */
  fit?: boolean
  /** Straight after the last release shown, such as a link to them all. */
  footer?: ReactNode
}

/** `code` spans in a changelog line, which both changelogs use for names. */
function withCode(text: string): ReactNode[] {
  return text.split('`').map((part, at) => (at % 2 === 1 ? <code key={at}>{part}</code> : part))
}

function versionLabel(release: Release): string {
  return release.version === 'unreleased' ? 'unreleased' : `v${release.version}`
}

/**
 * Beacon's releases and py-beacon's, newest first (BU-219).
 *
 * Both, because a change in either is a change in what the reader can do.
 * Each release opens to its notes — a native disclosure, so it works by
 * keyboard and needs no state here.
 */
export function ReleaseList({
  running,
  engine,
  fit = false,
  footer
}: ReleaseListProps): ReactElement {
  const all = useMemo(
    () => mergeReleases(APP_RELEASES, engine === undefined ? BUNDLED_ENGINE : fromEngine(engine)),
    [engine]
  )
  const releases = fit ? latestFirst(all) : all
  const list = useRef<HTMLDivElement>(null)
  useFitted(list, fit ? latestCount(all) : undefined, releases.length)

  return (
    <div
      ref={list}
      className={fit ? 'home-changelog-list home-changelog-fitted' : 'home-changelog-list'}
    >
      {releases.map((release) => (
        <details key={`${release.product}-${release.version}`} className="home-changelog-entry">
          <summary className="home-changelog-head">
            <span className="home-changelog-version">
              <span className="home-changelog-product">{release.product}</span>
              {versionLabel(release)}
              {isRunning(release, running) && <StatusPill status="info">current</StatusPill>}
            </span>
            <span className="home-changelog-summary">{withCode(release.summary)}</span>
          </summary>
          {release.date !== undefined && (
            <p className="home-changelog-date">Released {release.date}</p>
          )}
          {release.sections
            .filter((section) => section.items.length > 0)
            .map((section) => (
              <div key={section.heading} className="home-changelog-notes">
                <p className="home-changelog-heading">{section.heading}</p>
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{withCode(item)}</li>
                  ))}
                </ul>
              </div>
            ))}
        </details>
      ))}
      {footer !== undefined && (
        <div className="home-changelog-foot" data-keep="">
          {footer}
        </div>
      )}
    </div>
  )
}

/**
 * Hides the releases that would run past the list's bottom, keeping the
 * first `always` whatever the room, and room for a footer marked data-keep. Set on the elements, not in state: what
 * fits is only known once they are laid out, and React sets no `hidden` of
 * its own on them to overwrite. Measured again when the room changes or a
 * release is opened to its notes.
 */
function useFitted(
  list: { current: HTMLDivElement | null },
  always: number | undefined,
  count: number
): void {
  useLayoutEffect(() => {
    const box = list.current
    if (box === null || always === undefined) return undefined
    const place = (): void => {
      const children = [...box.children].filter((child) => child instanceof HTMLElement)
      const entries = children.filter((child) => !child.hasAttribute('data-keep'))
      for (const entry of entries) entry.hidden = false
      // The footer follows the last release shown, so its room is kept.
      const kept = children
        .filter((child) => child.hasAttribute('data-keep'))
        .reduce((room, child) => room + child.offsetHeight, 0)
      const floor = box.getBoundingClientRect().bottom - kept
      const over = entries.findIndex(
        (entry, at) => at >= always && entry.getBoundingClientRect().bottom > floor
      )
      if (over !== -1) for (const entry of entries.slice(over)) entry.hidden = true
    }
    const watcher = new ResizeObserver(place)
    watcher.observe(box)
    box.addEventListener('toggle', place, true)
    place()
    return () => {
      watcher.disconnect()
      box.removeEventListener('toggle', place, true)
    }
  }, [list, always, count])
}
