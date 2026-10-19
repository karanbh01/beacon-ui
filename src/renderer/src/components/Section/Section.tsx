import type { ReactElement, ReactNode } from 'react'
import './Section.css'

export interface SectionProps {
  /** 9px Medium at 6% tracking, muted — the section-head grammar. */
  title: string
  /** Right-aligned on the title row: a button, a count, a control. */
  aside?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * A titled part of a pane, sitting straight on it (Karan, 2026-10-17).
 *
 * The card's head without the card: forms, stat strips and tables are not
 * boxed behind a surface unless a design says so. Index Definition's details
 * form was the first to lose its card; this is that grammar, shared.
 */
export function Section({ title, aside, children, className }: SectionProps): ReactElement {
  return (
    <section className={['section', className].filter(Boolean).join(' ')}>
      <header className="section-head">
        <h3 className="section-title">{title}</h3>
        {aside !== undefined && <div className="section-aside">{aside}</div>}
      </header>
      {children}
    </section>
  )
}
