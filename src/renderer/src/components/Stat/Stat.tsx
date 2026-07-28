import type { ReactElement, ReactNode } from 'react'
import './Stat.css'

/** Signed values take success/danger; everything else stays primary. */
export type Tone = 'default' | 'positive' | 'negative'

export interface StatProps {
  label: string
  value: ReactNode
  tone?: Tone
  className?: string
}

/**
 * Figma 388:153. 10px Medium label at 0.4px tracking over a 16px Medium
 * value, 3px apart.
 *
 * Reserved for views where a headline number IS the point — Prices,
 * Fundamentals, Data Coverage, Frontier, Factor Exposures, Index Overview,
 * Backtest, Roll Analysis (taxonomy 7). Everywhere else uses SummaryLine.
 */
export function Stat({ label, value, tone = 'default', className }: StatProps): ReactElement {
  return (
    <div className={['stat', className].filter(Boolean).join(' ')}>
      <span className="stat-label">{label}</span>
      <span className={`stat-value tone-${tone}`}>{value}</span>
    </div>
  )
}

export interface StatStripProps {
  children: ReactNode
  /**
   * Gap in px. Taxonomy 7 specifies 40–48 depending on the view, so this is
   * a per-view choice rather than one global number.
   */
  gap?: number
  className?: string
}

export function StatStrip({ children, gap = 44, className }: StatStripProps): ReactElement {
  return (
    <div className={['stat-strip', className].filter(Boolean).join(' ')} style={{ columnGap: gap }}>
      {children}
    </div>
  )
}
