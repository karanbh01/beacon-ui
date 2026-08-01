import type { ReactElement } from 'react'
import './WeightBar.css'

export interface WeightBarProps {
  /** 0–1, against the largest value in the column. */
  share: number
  /** Capped names take the accent, so the constraint is visible in the row. */
  tone?: 'default' | 'accent' | 'negative'
  label?: string
}

/**
 * The inline bar beside a weight or a contribution (Figma 355:2292, 356:2298).
 *
 * Scaled against the LARGEST value in its column rather than against 100%: a
 * ten-name index would otherwise render ten bars all under a fifth of the
 * track, which conveys nothing about their relative size.
 */
export function WeightBar({ share, tone = 'default', label }: WeightBarProps): ReactElement {
  const width = Math.max(0, Math.min(1, share)) * 100

  return (
    <span
      className={`weight-bar weight-bar-${tone}`}
      role="img"
      aria-label={label ?? `${width.toFixed(0)}% of the largest`}
    >
      <span className="weight-bar-fill" style={{ width: `${String(width)}%` }} />
    </span>
  )
}
