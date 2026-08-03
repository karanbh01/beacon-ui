import type { ReactElement } from 'react'
import { StatusPill, type PillStatus } from '@/components/Badge/Badge'

export interface Activity {
  id: string
  label: string
  /** "2h ago", "yesterday", "running" — relative, as the frame has it. */
  when: string
  status: PillStatus
  /** Pill text; the percentage for a running job, otherwise the status word. */
  detail?: string
}

export interface RecentActivityProps {
  activity: readonly Activity[]
  onOpen?: (id: string) => void
}

/**
 * Figma 73:185. Rows 663 wide, a 0.5px divider under each but the last.
 *
 * The one section of Home with a live source. It shows nothing rather than
 * placeholder rows when there is no history — a first run has genuinely done
 * nothing, and inventing four finished jobs would be a lie the user cannot
 * check.
 */
export function RecentActivity({ activity, onOpen }: RecentActivityProps): ReactElement {
  return (
    <section className="home-section home-activity">
      <h2 className="type-section-label home-label">Recent Activity</h2>

      {activity.length === 0 ? (
        <p className="home-activity-empty">
          Nothing has run yet. Anything you calculate, backtest or fetch shows up here.
        </p>
      ) : (
        <ul className="home-activity-rows">
          {activity.map((item) => (
            <li key={item.id} className="home-activity-row">
              <button
                type="button"
                className="home-activity-label"
                onClick={() => {
                  onOpen?.(item.id)
                }}
                disabled={onOpen === undefined}
              >
                <span className="home-activity-name">{item.label}</span>
                <span className="home-activity-when">{item.when}</span>
              </button>
              <StatusPill status={item.status}>{item.detail ?? item.status}</StatusPill>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
