import type { ReactElement } from 'react'
import type { UpdateState } from '@shared/ipc'
import type { UpdateAction } from '../state/update'
import { GithubIcon } from '../icons/generated'
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle'
import type { ThemeMode } from '../tokens/tokens'
import { updateNotice, type UpdateNotice } from './updateNotice'
import './Footer.css'

export type EngineState = 'connected' | 'degraded' | 'starting' | 'stopped'

export interface FooterProps {
  /** Live from the python supervisor (BU-19). */
  engine?: { state: EngineState; version?: string; detail?: string }
  /** e.g. "2h ago". BU-21 supplies it from freshness events. */
  dataUpdated?: string
  version?: string
  /** Live from electron-updater via main (BU-34). */
  update?: UpdateState
  /**
   * One callback rather than three: the footer decides what its own label
   * means, and the app only has to route it.
   */
  onUpdateAction?: (action: UpdateAction) => void
  onOpenRepo?: () => void
  /** The mode on screen. Omit both to hide the theme toggle (BU-39). */
  themeMode?: ThemeMode
  onThemeChange?: (mode: ThemeMode) => void
  className?: string
}

const ENGINE_TONE: Record<EngineState, string> = {
  connected: 'dot-success',
  degraded: 'dot-danger',
  stopped: 'dot-danger',
  starting: 'dot-accent'
}

/**
 * `degraded` and `stopped` read differently on purpose: degraded means a
 * restart is in flight, stopped means we gave up. Saying "reconnecting" when
 * nothing is reconnecting is the failure mode BU-19 is meant to remove.
 */
function engineLabel(state: EngineState, version?: string): string {
  if (state === 'degraded') return 'engine unavailable · reconnecting'
  if (state === 'stopped') return 'engine stopped'
  if (state === 'starting') return 'engine starting…'
  return version === undefined ? 'engine connected' : `engine connected · py-beacon ${version}`
}

/** Text when there is nothing to click, a button when there is. */
function UpdateSlot({
  notice,
  onAction
}: {
  notice: UpdateNotice
  onAction?: (action: UpdateAction) => void
}): ReactElement {
  const className = notice.tone === 'muted' ? 'footer-update footer-update-muted' : 'footer-update'

  if (notice.action === undefined) {
    return (
      <span className={className} title={notice.title}>
        {notice.label}
      </span>
    )
  }

  const action = notice.action
  return (
    <button
      type="button"
      className={className}
      title={notice.title}
      onClick={() => onAction?.(action)}
    >
      {notice.label}
    </button>
  )
}

/**
 * Figma 93:3. 32px tall, 0.5px top rule. Status text is 11px and the version
 * cluster is ITALIC, which is unusual enough to be worth stating: it is the
 * only italic in the app chrome.
 *
 * The version is a button because clicking it checks for updates — the only
 * user-initiated route there is, and the one that makes a failed check worth
 * reporting at all (a timed check that fails stays quiet; see updateNotice).
 */
export function Footer({
  engine = { state: 'connected' },
  dataUpdated,
  version,
  update,
  onUpdateAction,
  onOpenRepo,
  themeMode,
  onThemeChange,
  className
}: FooterProps): ReactElement {
  const notice = updateNotice(update)

  return (
    <footer className={['footer', className].filter(Boolean).join(' ')}>
      <span className="footer-status" title={engine.detail}>
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
        {themeMode !== undefined && onThemeChange !== undefined && (
          <ThemeToggle mode={themeMode} onChange={onThemeChange} className="footer-theme" />
        )}
        {version !== undefined && (
          <button
            type="button"
            className="footer-version"
            title="Check for updates"
            onClick={() => onUpdateAction?.('check')}
          >
            version {version}
            {notice !== undefined && ' ·'}
          </button>
        )}
        {notice !== undefined && (
          <UpdateSlot
            notice={notice}
            {...(onUpdateAction === undefined ? {} : { onAction: onUpdateAction })}
          />
        )}
        <button type="button" className="footer-icon" aria-label="Repository" onClick={onOpenRepo}>
          <GithubIcon size={24} />
        </button>
      </span>
    </footer>
  )
}
