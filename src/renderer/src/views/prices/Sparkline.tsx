import { useMemo, type ReactElement } from 'react'

export interface SparklineProps {
  values: readonly number[]
  /** Accessible name, since the shape itself says nothing to a reader. */
  label: string
  width?: number
  height?: number
}

/**
 * The series as a shape, in the summary block (BU-141, Figma 266:2820).
 *
 * An SVG polyline rather than a lightweight-charts instance: this has no
 * axis, no crosshair, no pan and no zoom, and a second chart engine on the
 * same pane would cost a canvas and a resize observer to draw sixty points.
 * Anything that wants those affordances belongs in Charting, which is what
 * the link beside this offers.
 *
 * Down-sampled by stride rather than averaged. A sparkline is read for its
 * shape, and a mean would smooth away exactly the spikes that shape is being
 * read for.
 */
const MAX_POINTS = 120

export function Sparkline({
  values,
  label,
  width = 168,
  height = 44
}: SparklineProps): ReactElement | null {
  const points = useMemo(() => {
    const finite = values.filter((value) => Number.isFinite(value))
    if (finite.length < 2) return ''

    const stride = Math.ceil(finite.length / MAX_POINTS)
    const sampled = finite.filter((_value, index) => index % stride === 0)
    const low = Math.min(...sampled)
    const high = Math.max(...sampled)
    // A flat series would divide by zero; draw it down the middle instead.
    const span = high - low === 0 ? 1 : high - low
    const step = sampled.length === 1 ? 0 : (width - 2) / (sampled.length - 1)

    return sampled
      .map((value, index) => {
        const x = 1 + index * step
        const y = height - 1 - ((value - low) / span) * (height - 2)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [values, width, height])

  if (points === '') return null

  return (
    <svg
      className="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      role="img"
      aria-label={label}
    >
      <polyline points={points} fill="none" strokeWidth={1.5} />
    </svg>
  )
}
