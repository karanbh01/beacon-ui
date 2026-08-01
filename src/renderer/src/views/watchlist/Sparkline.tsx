import type { ReactElement } from 'react'
import { sparkPoints } from './watchlist'
import './Sparkline.css'

export interface SparklineProps {
  values: readonly number[]
  width?: number
  height?: number
  /** Rising green, falling red — the same signed colouring the table uses. */
  tone?: 'positive' | 'negative' | 'default'
}

/**
 * The 3M spark in a watchlist row (Figma 302:11169), 90x18.
 *
 * Hand-drawn as an SVG polyline rather than reaching for a chart library:
 * there are no axes, no ticks, no interaction and no legend, so everything a
 * chart library provides is weight this does not need. BU-28 picks a library
 * for real charts; a sparkline is not one.
 */
export function Sparkline({
  values,
  width = 90,
  height = 18,
  tone = 'default'
}: SparklineProps): ReactElement {
  const points = sparkPoints(values, width, height)

  if (points === '') {
    return <span className="spark-empty" aria-hidden="true" />
  }

  return (
    <svg
      className={`spark spark-${tone}`}
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      role="img"
      aria-label={`${String(values.length)}-session trend`}
      preserveAspectRatio="none"
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1} />
    </svg>
  )
}
