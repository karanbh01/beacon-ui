import type { ReactElement, ReactNode } from 'react'
import './Badge.css'

export interface BadgeProps {
  children: ReactNode
  className?: string
}

/**
 * Figma 324:1573. The rule-type badge in a methodology row (FilterRule,
 * CapRule…). 0.5px chrome-border stroke, 3px radius, 10px Medium accent.
 *
 * Same stroke and radius as a tab chip, but 10px Medium rather than 10.5px
 * Regular — a badge names a type, a chip names a bound object.
 */
export function Badge({ children, className }: BadgeProps): ReactElement {
  return <span className={['badge', className].filter(Boolean).join(' ')}>{children}</span>
}

export type PillStatus = 'done' | 'running' | 'failed' | 'info'

export interface StatusPillProps {
  status: PillStatus
  children?: ReactNode
  className?: string
}

/**
 * Figma set 68:351. Filled pill for job state, using the status-* token
 * pairs. BU-21's job flow is the real consumer; it exists here because the
 * tokens and the component already do.
 */
export function StatusPill({ status, children, className }: StatusPillProps): ReactElement {
  return (
    <span className={['pill', `pill-${status}`, className].filter(Boolean).join(' ')}>
      {children ?? status}
    </span>
  )
}
