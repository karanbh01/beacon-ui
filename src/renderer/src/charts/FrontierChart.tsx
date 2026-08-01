import { useMemo, type ReactElement } from 'react'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { Group } from '@visx/group'
import { scaleLinear } from '@visx/scale'
import { COLORS, type ThemeMode } from '../tokens/tokens'
import { seriesColor } from './theme'
import './FrontierChart.css'

export interface FrontierDot {
  volatility: number
  expectedReturn: number
  /** Constraints that bound at this point, if any. */
  binding: readonly string[]
  /** Solved exactly, or reached by a fallback search. */
  heuristic: boolean
}

export interface Marker {
  label: string
  volatility: number
  expectedReturn: number
}

export interface FrontierChartProps {
  points: readonly FrontierDot[]
  mode: ThemeMode
  /** Highlighted points — tangency, minimum variance, the index itself. */
  markers?: readonly Marker[]
  /** Draws the capital market line from (0, rf) through the tangency point. */
  riskFreeRate?: number
  tangency?: Marker | undefined
  width?: number
  height?: number
}

const MARGIN = { top: 16, right: 24, bottom: 44, left: 56 }

/**
 * The efficient frontier (Figma 342:1254).
 *
 * visx rather than lightweight-charts, per ADR-0002: there is no time axis
 * here, and a scatter with a capital market line is exactly the shape that
 * ADR reserved for the d3 layer. SVG is also the right renderer at this size —
 * a frontier is tens of points, not thousands.
 *
 * Percentages throughout, because that is what the axes read: py-beacon sends
 * fractions and the view multiplies once, at the edge.
 */
export function FrontierChart({
  points,
  mode,
  markers = [],
  riskFreeRate,
  tangency,
  width = 720,
  height = 460
}: FrontierChartProps): ReactElement {
  const token = COLORS[mode]
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const { x, y } = useMemo(() => {
    const all = [...points, ...markers, ...(tangency === undefined ? [] : [tangency])]
    const vols = all.map((point) => point.volatility)
    const returns = all.map((point) => point.expectedReturn)
    // The CML starts at the risk-free rate on the return axis, so it has to
    // be inside the domain or the line leaves the plot immediately.
    if (riskFreeRate !== undefined) returns.push(riskFreeRate)

    return {
      x: scaleLinear<number>({
        domain: [Math.min(...vols, 0), Math.max(...vols, 0.01)],
        range: [0, innerWidth],
        nice: true
      }),
      y: scaleLinear<number>({
        domain: [Math.min(...returns, 0), Math.max(...returns, 0.01)],
        range: [innerHeight, 0],
        nice: true
      })
    }
  }, [points, markers, tangency, riskFreeRate, innerWidth, innerHeight])

  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${String(x(point.volatility))},${String(y(point.expectedReturn))}`
    )
    .join(' ')

  return (
    <svg
      className="frontier-chart"
      width={width}
      height={height}
      role="img"
      aria-label="Efficient frontier"
    >
      <Group left={MARGIN.left} top={MARGIN.top}>
        <AxisLeft
          scale={y}
          numTicks={6}
          stroke={token.divider}
          tickStroke={token.divider}
          tickFormat={(value) => `${(Number(value) * 100).toFixed(0)}%`}
          tickLabelProps={() => ({
            fill: token['text-muted'],
            fontSize: 10,
            textAnchor: 'end',
            dx: -4,
            dy: 3
          })}
        />
        <AxisBottom
          top={innerHeight}
          scale={x}
          numTicks={6}
          stroke={token.divider}
          tickStroke={token.divider}
          tickFormat={(value) => `${(Number(value) * 100).toFixed(0)}%`}
          tickLabelProps={() => ({
            fill: token['text-muted'],
            fontSize: 10,
            textAnchor: 'middle',
            dy: 2
          })}
        />

        {/* The capital market line: rf on the return axis through tangency. */}
        {riskFreeRate !== undefined && tangency !== undefined && (
          <line
            className="frontier-cml"
            x1={x(0)}
            y1={y(riskFreeRate)}
            x2={x(tangency.volatility * 1.35)}
            y2={y(riskFreeRate + (tangency.expectedReturn - riskFreeRate) * 1.35)}
            stroke={token['text-muted']}
            strokeDasharray="3 3"
          />
        )}

        {path !== '' && (
          <path d={path} fill="none" stroke={seriesColor(mode, 0)} strokeWidth={1.5} />
        )}

        {points.map((point, index) => (
          <circle
            key={index}
            cx={x(point.volatility)}
            cy={y(point.expectedReturn)}
            r={point.binding.length > 0 ? 3.5 : 2}
            // A point where a constraint bound is a different fact from one
            // that did not: the shape of the frontier there is the
            // constraint's doing, not the risk model's.
            fill={point.binding.length > 0 ? seriesColor(mode, 2) : seriesColor(mode, 0)}
            opacity={point.heuristic ? 0.45 : 1}
          />
        ))}

        {markers.map((marker) => (
          <Group key={marker.label} left={x(marker.volatility)} top={y(marker.expectedReturn)}>
            <circle r={4.5} fill="none" stroke={seriesColor(mode, 1)} strokeWidth={1.5} />
            <text className="frontier-marker" x={8} y={3} fill={token['text-secondary']}>
              {marker.label}
            </text>
          </Group>
        ))}

        <text
          className="frontier-axis-title"
          x={innerWidth}
          y={innerHeight + 34}
          textAnchor="end"
          fill={token['text-muted']}
        >
          ex-ante volatility →
        </text>
        <text className="frontier-axis-title" x={0} y={-4} fill={token['text-muted']}>
          expected return ↑
        </text>
      </Group>
    </svg>
  )
}
