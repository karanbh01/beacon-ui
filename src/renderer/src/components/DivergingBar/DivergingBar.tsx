import type { ReactElement } from 'react'
import type { ThemeMode } from '../../tokens/tokens'
import './DivergingBar.css'

export interface DivergingBarProps {
  value: number
  /** The largest absolute value in the column; both halves scale to it. */
  extent: number
  mode: ThemeMode
  label?: string
}

/**
 * A bar that grows either side of a centre line (Figma 351:1259).
 *
 * Both halves scale to the same extent, so a +0.34 and a −0.34 are mirror
 * images. Scaling each side to its own maximum would make a small negative
 * tilt look as significant as the largest positive one.
 */
export function DivergingBar({ value, extent, mode, label }: DivergingBarProps): ReactElement {
  const share = extent === 0 ? 0 : Math.min(1, Math.abs(value) / extent)
  const width = (share * 50).toFixed(2)

  return (
    <span
      className="diverging-bar"
      role="img"
      aria-label={label ?? `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`}
      data-mode={mode}
    >
      <span className="diverging-axis" aria-hidden="true" />
      <span
        className={value >= 0 ? 'diverging-fill is-positive' : 'diverging-fill is-negative'}
        style={
          value >= 0 ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }
        }
      />
    </span>
  )
}
