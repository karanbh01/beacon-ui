import type { ReactElement, ReactNode } from 'react'
import appChangelog from '../../../../../CHANGELOG.md?raw'
import engineChangelog from '../../../../../py-beacon.CHANGELOG.md?raw'
import { StatusPill } from '@/components/Badge/Badge'
import { isRunning, mergeReleases, parseChangelog, type Release } from './releases'

/**
 * Read once, at load: both files are bundled with the build, so the list
 * cannot change while the app runs. py-beacon's copy is made by
 * `spec:refresh`, beside the spec the client was generated against.
 */
const RELEASES = mergeReleases(
  parseChangelog(appChangelog, 'Beacon'),
  parseChangelog(engineChangelog, 'py-beacon')
)

export interface ReleaseListProps {
  /** What is running, so `current` is true of something (BU-219). */
  running: { app?: string | undefined; engine?: string | undefined }
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
export function ReleaseList({ running }: ReleaseListProps): ReactElement {
  return (
    <div className="home-changelog-list">
      {RELEASES.map((release) => (
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
    </div>
  )
}
