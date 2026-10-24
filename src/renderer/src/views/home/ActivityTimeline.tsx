import { useEffect, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { ActivityEntry, ActivityTarget } from '../../state/activityLog'
import { relativeTime } from './activityRows'
import './ActivityTimeline.css'

export type { ActivityEntry, ActivityStep, ActivityTarget } from '../../state/activityLog'

export interface ActivityTimelineProps {
  entries: readonly ActivityEntry[]
  now: number
  onOpen?: (target: ActivityTarget) => void
}

/**
 * Recent Activity as a timeline (BU-287, Karan): one thin rail, a filled dot
 * for each activity that leads somewhere and a hollow one for its steps and
 * for anything that does not. Times are relative, "2h ago". A filled dot's
 * title opens a short list of where it leads.
 */
export function ActivityTimeline({ entries, now, onOpen }: ActivityTimelineProps): ReactElement {
  return (
    <ol className="timeline">
      {entries.map((entry) => (
        <Entry
          key={entry.id}
          entry={entry}
          now={now}
          {...(onOpen === undefined ? {} : { onOpen })}
        />
      ))}
    </ol>
  )
}

function Entry({
  entry,
  now,
  onOpen
}: {
  entry: ActivityEntry
  now: number
  onOpen?: (target: ActivityTarget) => void
}): ReactElement {
  const opens = onOpen === undefined ? [] : (entry.opens ?? [])
  // Where the list hangs, under the title, in the window's coordinates.
  const [at, setAt] = useState<{ top: number; left: number } | undefined>(undefined)
  const open = at !== undefined
  const title = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  useDismiss(open, [title, list], () => {
    setAt(undefined)
  })

  const heading =
    opens.length === 0 ? (
      <span className="timeline-title">{entry.title}</span>
    ) : (
      <button
        ref={title}
        type="button"
        className="timeline-title timeline-title-link"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          setAt(open ? undefined : { top: box.bottom + 4, left: box.left })
        }}
      >
        {entry.title}
      </button>
    )

  return (
    <li className={`timeline-entry timeline-${entry.status}`}>
      <div className="timeline-row">
        <span className="timeline-when">
          {entry.status === 'running' ? 'now' : relativeTime(entry.at, now)}
        </span>
        <span
          className={`timeline-dot${opens.length === 0 ? ' timeline-dot-hollow' : ''}`}
          aria-hidden="true"
        />
        <div className="timeline-body">
          {heading}
          {/*
            On the page itself, not in the row: Home's timeline scrolls, and a
            list hung inside it was cut off at its edge.
          */}
          {at !== undefined &&
            createPortal(
              <div
                ref={list}
                className="dropdown-surface timeline-opens"
                role="menu"
                aria-label={entry.title}
                style={{ top: at.top, left: at.left }}
              >
                {opens.map((choice) => (
                  <button
                    key={choice.label}
                    type="button"
                    role="menuitem"
                    className="menu-button-item type-11"
                    onClick={() => {
                      setAt(undefined)
                      onOpen?.(choice.target)
                    }}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>,
              document.body
            )}
        </div>
        {entry.detail !== undefined && <span className="timeline-detail">{entry.detail}</span>}
      </div>
      {entry.steps !== undefined && entry.steps.length > 0 && (
        <ol className="timeline-steps">
          {entry.steps.map((step, at) => (
            <li
              key={`${step.label}-${String(at)}`}
              className={`timeline-row timeline-step${step.failed === true ? ' timeline-step-failed' : ''}`}
            >
              <span className="timeline-when" />
              <span className="timeline-dot timeline-dot-hollow" aria-hidden="true" />
              <span className="timeline-step-label">{step.label}</span>
              {step.detail !== undefined && <span className="timeline-detail">{step.detail}</span>}
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}

/**
 * Closes a list on a click outside it or Escape, as the app's other lists do,
 * and on a scroll, which would leave it hanging where its title was.
 */
function useDismiss(
  open: boolean,
  boxes: readonly { current: HTMLElement | null }[],
  close: () => void
): void {
  useEffect(() => {
    if (!open) return undefined
    const onDown = (event: MouseEvent): void => {
      const target = event.target
      if (target instanceof Node && boxes.some((box) => box.current?.contains(target) === true)) {
        return
      }
      close()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', close, true)
    }
  }, [open, boxes, close])
}
