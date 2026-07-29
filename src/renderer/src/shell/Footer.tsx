import type { ReactElement } from 'react'
import { GithubIcon } from '../icons/generated'
import './Footer.css'

export type EngineState = 'connected' | 'degraded' | 'starting'

export interface FooterProps {
  /** Stubbed here; BU-19 wires it to the real python process. */
  engine?: { state: EngineState; version?: string }
  /** e.g. "2h ago". BU-21 supplies it from freshness events. */
  dataUpdated?: string
  version?: string
  updateAvailable?: boolean
  onOpenRepo?: () => void
  className?: string
}

const ENGINE_TONE: Record<EngineState, string> = {
  connected: 'dot-success',
  degraded: 'dot-danger',
  starting: 'dot-accent'
}

function engineLabel(state: EngineState, version?: string): string {
  if (state === 'degraded') return 'engine unavailable'
  if (state === 'starting') return 'engine starting…'
  return version === undefined ? 'engine connected' : `engine connected · py-beacon ${version}`
}

/**
 * Figma 93:3. 32px tall, 0.5px top rule. Status text is 11px and the version
 * cluster is ITALIC, which is unusual enough to be worth stating: it is the
 * only italic in the app chrome.
 *
 * Every slot is stubbed. BU-19 owns the engine state truthfully — the point
 * of the degraded tone existing now is that the footer must be able to say
 * "unavailable" the moment there is a real process to lose.
 */
export function Footer({
  engine = { state: 'connected' },
  dataUpdated,
  version,
  updateAvailable = false,
  onOpenRepo,
  className
}: FooterProps): ReactElement {
  return (
    <footer className={['footer', className].filter(Boolean).join(' ')}>
      <span className="footer-status">
        <span className={`footer-dot ${ENGINE_TONE[engine.state]}`} aria-hidden="true" />
        {engineLabel(engine.state, engine.version)}
      </span>

      {dataUpdated !== undefined && (
        <span className="footer-status">
          <span className="footer-dot dot-accent" aria-hidden="true" />
          data updated · {dataUpdated}
        </span>
      )}

      <span className="footer-right">
        {version !== undefined && <span className="footer-version">version {version} ·</span>}
        {updateAvailable && <span className="footer-update">update available</span>}
        <button type="button" className="footer-icon" aria-label="Repository" onClick={onOpenRepo}>
          <GithubIcon size={24} />
        </button>
      </span>
    </footer>
  )
}
