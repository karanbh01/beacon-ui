import type { ReactElement } from 'react'
import { signed } from '../../mocks/tech10'

export interface WeightBarProps {
  value: number
  /** The largest value in the column; the bar is relative to this, not 100%. */
  max: number
  width?: number
}

/**
 * The weight lane from Figma 355:2376. The fill runs to 95% of the lane at
 * the column maximum, not to the full width — AVGO's 16.62 against a 20 cap
 * measures 157.89px in a 200px lane, which is exactly 16.62 / 20 * 190.
 */
export function WeightBar({ value, max, width = 200 }: WeightBarProps): ReactElement {
  const fraction = max === 0 ? 0 : Math.max(0, Math.min(value / max, 1))
  return (
    <div className="tbl-bar" style={{ width }} aria-hidden="true">
      <div className="tbl-bar-fill" style={{ width: fraction * width * 0.95 }} />
    </div>
  )
}

/** Signed values take success/danger; zero stays neutral (taxonomy 9). */
export function DeltaCell({ value }: { value: number }): ReactElement {
  if (value === 0) return <span>0.00</span>
  return <span className={value > 0 ? 'num-pos' : 'num-neg'}>{signed(value)}</span>
}
