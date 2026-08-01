import type { UpdateState } from '@shared/ipc'

export interface UpdateNotice {
  /** Figma 93:3 keeps this short — the detail belongs in the tooltip. */
  label: string
  title: string
  /** Present only when the label is a control rather than a report. */
  action?: 'download' | 'install'
  tone: 'danger' | 'muted'
}

function named(version: string | undefined): string {
  return version === undefined ? 'A new version' : `Beacon ${version}`
}

/**
 * What the footer's update slot should say, if anything.
 *
 * `idle` returns nothing on purpose: "you are up to date" is not information
 * anyone needs in a status bar, and neither is "I have not checked yet".
 *
 * The two states that need the user are in `danger` — the same red the engine
 * uses when it is unavailable — because they are the only ones with an action
 * behind them. Progress and failure are muted: one is transient and the other
 * is not something the user can fix.
 */
export function updateNotice(update: UpdateState = { status: 'idle' }): UpdateNotice | undefined {
  switch (update.status) {
    case 'available':
      return {
        label: 'update available',
        title: `${named(update.version)} is ready to download`,
        action: 'download',
        tone: 'danger'
      }
    case 'downloading':
      return {
        label: `downloading · ${String(update.percent ?? 0)}%`,
        title: `Downloading ${named(update.version)}`,
        tone: 'muted'
      }
    case 'ready':
      return {
        label: 'restart to update',
        title: `${named(update.version)} installs when you restart Beacon`,
        action: 'install',
        tone: 'danger'
      }
    case 'checking':
      return { label: 'checking for updates…', title: 'Checking for updates', tone: 'muted' }
    case 'error':
      return {
        label: 'update check failed',
        title: update.detail ?? 'Could not check for updates',
        tone: 'muted'
      }
    default:
      return undefined
  }
}
