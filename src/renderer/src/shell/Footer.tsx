import type { ReactElement } from 'react'
import type { EngineStatus, UpdateState } from '@shared/ipc'
import type { UpdateAction } from '../state/update'
import { GithubIcon } from '../icons/generated'
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle'
import type { ThemeMode } from '../tokens/tokens'
import { updateNotice, type UpdateNotice } from './updateNotice'
import './Footer.css'

/**
 * The engine's own status, not a second copy of it.
 *
 * This was a hand-written union of the same four names, and it drifted the
 * moment a fifth was added (BU-115) — the alias is what makes that a compile
 * error rather than a footer with a missing case.
 */
export type EngineState = EngineStatus

export interface FooterProps {
  /** Live from the python supervisor (BU-19). */
  engine?: { state: EngineState; version?: string; detail?: string }
  /** e.g. "2h ago". BU-21 supplies it from freshness events. */
  dataUpdated?: string
  /**
   * Whether the engine has data to serve, and whether it is loading some
   * (BU-215). Absent from an engine before py-beacon 0.1.2, which the slot
   * treats as loaded — the only state such an engine could be in while it
   * answered, and not a gap to report.
   */
  data?: { loaded?: boolean; loading?: boolean }
  /**
   * What is running in the background, in words (BU-201).
   *
   * An empty list is a state worth showing rather than an absence: "all
   * background processes complete" is the answer to "is anything still
   * going?", and a slot that disappears when the answer is no leaves the
   * reader unable to tell finished from never started.
   */
  work?: { running: readonly string[] }
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
  idle: 'dot-muted',
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
  if (state === 'idle') return 'engine not started'
  if (state === 'degraded') return 'engine unavailable · reconnecting'
  if (state === 'stopped') return 'engine stopped'
  if (state === 'starting') return 'engine starting…'
  return version === undefined ? 'engine connected' : `engine connected · py-beacon ${version}`
}

/**
 * What the background slot says.
 *
 * Named while there is one thing, counted while there are several: "2
 * background processes running" is more use than two verbs run together, and
 * a reader who wants the detail has the job tray.
 */
/**
 * The data slot, in the three states an engine can be in (BU-215).
 *
 * Red when nothing is loaded — Karan's call: the footer already reports on
 * data, so it is where "there is none" belongs, rather than a screen of its
 * own. Loading reads as work, since the previous data is still served until
 * the load finishes. Otherwise the freshness it always showed.
 */
function DataSlot({
  data,
  updated
}: {
  data: FooterProps['data']
  updated: string | undefined
}): ReactElement | null {
  if (data?.loading === true) {
    return (
      <span className="footer-status">
        <span className="footer-dot dot-working" aria-hidden="true" />
        loading data…
      </span>
    )
  }
  if (data?.loaded === false) {
    return (
      <span className="footer-status footer-status-missing">
        <span className="footer-dot dot-danger" aria-hidden="true" />
        no data loaded · Data menu
      </span>
    )
  }
  if (updated === undefined) return null
  return (
    <span className="footer-status">
      <span className="footer-dot dot-accent" aria-hidden="true" />
      data updated · {updated}
    </span>
  )
}

function workLabel(running: readonly string[]): string {
  if (running.length === 0) return 'all background processes complete'
  if (running.length === 1) return `${running[0] ?? 'working'}…`
  return `${String(running.length)} background processes running`
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
  data,
  work,
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

      <DataSlot data={data} updated={dataUpdated} />

      {work !== undefined && (
        <span className="footer-status">
          <span
            className={`footer-dot ${work.running.length === 0 ? 'dot-success' : 'dot-working'}`}
            aria-hidden="true"
          />
          {workLabel(work.running)}
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
