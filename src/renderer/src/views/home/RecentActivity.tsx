import { useState, type ReactElement } from 'react'
import { Dialog } from '@/components/Dialog/Dialog'
import { ActivityTimeline, type ActivityEntry, type ActivityTarget } from './ActivityTimeline'
import { EdgeScroll } from './EdgeScroll'
import { ExpandButton } from './ExpandButton'

export interface RecentActivityProps {
  activity: readonly ActivityEntry[]
  now: number
  onOpen?: (target: ActivityTarget) => void
}

/**
 * Home's Recent Activity, as a timeline (BU-287, Karan). It scrolls within
 * the room Home gives it, its edges blurring and its rows drawing back as
 * they near one; the expand button beside the title shows it whole, as a
 * plain list in a pop-up.
 *
 * It shows nothing rather than placeholder rows when there is no history: a
 * first run has genuinely done nothing, and inventing finished jobs would be
 * a lie the user cannot check.
 */
export function RecentActivity({ activity, now, onOpen }: RecentActivityProps): ReactElement {
  const [whole, setWhole] = useState(false)
  const open = (target: ActivityTarget): void => {
    setWhole(false)
    onOpen?.(target)
  }
  const handlers = onOpen === undefined ? {} : { onOpen: open }

  return (
    <section className="home-section home-activity">
      <div className="home-label-row">
        <h2 className="type-section-label home-label">Recent Activity</h2>
        {activity.length > 0 && (
          <ExpandButton
            label="All recent activity"
            onClick={() => {
              setWhole(true)
            }}
          />
        )}
      </div>

      {activity.length === 0 ? (
        <p className="home-activity-empty">
          Nothing has run yet. Anything you calculate, backtest or fetch shows up here.
        </p>
      ) : (
        <EdgeScroll rows=".timeline-row" byParts text=".timeline-title, .timeline-step-label">
          <ActivityTimeline entries={activity} now={now} {...handlers} />
        </EdgeScroll>
      )}

      {whole && (
        <Dialog
          title="Recent Activity"
          width={640}
          onClose={() => {
            setWhole(false)
          }}
        >
          <div className="home-whole-list">
            <ActivityTimeline entries={activity} now={now} {...handlers} />
          </div>
        </Dialog>
      )}
    </section>
  )
}
