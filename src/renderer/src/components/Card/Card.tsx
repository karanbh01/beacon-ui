import type { ReactElement, ReactNode } from 'react'
import './Card.css'

export interface CardProps {
  /** 9px Medium at 6% tracking, muted — the section-head grammar. */
  title?: string
  /** Right-aligned slot on the title row, e.g. a count or a control. */
  aside?: ReactNode
  children: ReactNode
  /** Removes the body padding, for a Table that supplies its own gutters. */
  flush?: boolean
  className?: string
}

/**
 * Surface card at radius 6 — the same shell the Table uses (taxonomy 9).
 * Cards hug their content rather than filling; width comes from the layout.
 */
export function Card({
  title,
  aside,
  children,
  flush = false,
  className
}: CardProps): ReactElement {
  return (
    <section className={['card', className].filter(Boolean).join(' ')}>
      {(title !== undefined || aside !== undefined) && (
        <header className="card-head">
          {title !== undefined && <h3 className="card-title">{title}</h3>}
          {aside !== undefined && <div className="card-aside">{aside}</div>}
        </header>
      )}
      <div className={flush ? 'card-body card-flush' : 'card-body'}>{children}</div>
    </section>
  )
}
