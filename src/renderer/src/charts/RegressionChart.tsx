import { useId, useMemo, useRef, type ReactElement } from 'react'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { Group } from '@visx/group'
import { scaleLinear } from '@visx/scale'
import { COLORS, type ThemeMode } from '../tokens/tokens'
import { useWidth } from './useWidth'
import './RegressionChart.css'

/** One day: the comparator's move across, the fund's up. */
export interface RegressionDot {
  key: string
  x: number
  y: number
  /** In the period picked elsewhere, and drawn over the rest. */
  lit: boolean
}

/** A fitted line: y = intercept + slope × x. */
export interface RegressionLine {
  key: string
  slope: number
  intercept: number
  colour: string
  dashed?: boolean
}

export interface RegressionChartProps {
  dots: readonly RegressionDot[]
  lines: readonly RegressionLine[]
  mode: ThemeMode
  height: number
  /** The colour of a lit day; the rest are faint. */
  litColour: string
  xLabel: string
  yLabel: string
}

const MARGIN = { top: 8, right: 8, bottom: 36, left: 56 }

/**
 * The fund's daily moves on its comparator's, under the fitted lines
 * (Karan, 2026-11-23). Both axes run as far either way from nothing as the
 * largest move, so a small day sits in the middle and neither axis flatters
 * the other. visx, as the frontier is (ADR-0002).
 */
export function RegressionChart({
  dots,
  lines,
  mode,
  height,
  litColour,
  xLabel,
  yLabel
}: RegressionChartProps): ReactElement {
  const token = COLORS[mode]
  const host = useRef<HTMLDivElement>(null)
  const clip = useId()
  const width = useWidth(host)
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const { x, y, reach } = useMemo(() => {
    // The largest move either way, so the two axes share one scale.
    const reach = Math.max(...dots.flatMap((dot) => [Math.abs(dot.x), Math.abs(dot.y)]), 0.01)
    return {
      reach,
      x: scaleLinear<number>({ domain: [-reach, reach], range: [0, innerWidth], nice: true }),
      y: scaleLinear<number>({ domain: [-reach, reach], range: [innerHeight, 0], nice: true })
    }
  }, [dots, innerWidth, innerHeight])

  const axis = { stroke: token['text-primary'], tickStroke: token['text-primary'] }
  const text = { fill: token['text-primary'], fontSize: 10 }
  const tick = (value: unknown): string => `${(Number(value) * 100).toFixed(1)}%`
  // The lit days last, so they sit over the rest.
  const ordered = useMemo(
    () => [...dots].sort((one, other) => Number(one.lit) - Number(other.lit)),
    [dots]
  )

  return (
    <div className="regression-chart" ref={host}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${yLabel} on ${xLabel}`}>
          <defs>
            <clipPath id={clip}>
              <rect width={innerWidth} height={innerHeight} />
            </clipPath>
          </defs>
          <Group left={MARGIN.left} top={MARGIN.top}>
            <line x1={x(0)} x2={x(0)} y1={0} y2={innerHeight} stroke={token.divider} />
            <line x1={0} x2={innerWidth} y1={y(0)} y2={y(0)} stroke={token.divider} />
            <AxisLeft
              scale={y}
              numTicks={4}
              {...axis}
              tickLength={-3}
              tickFormat={tick}
              tickLabelProps={() => ({ ...text, textAnchor: 'end', dx: -6, dy: 3 })}
            />
            <AxisBottom
              top={innerHeight}
              scale={x}
              numTicks={4}
              {...axis}
              tickLength={-3}
              tickFormat={tick}
              tickLabelProps={() => ({ ...text, textAnchor: 'middle', dy: 6 })}
            />
            {ordered.map((dot) => (
              <circle
                key={dot.key}
                className={dot.lit ? 'regression-lit' : 'regression-day'}
                cx={x(dot.x)}
                cy={y(dot.y)}
                r={dot.lit ? 2.4 : 1.7}
                fill={dot.lit ? litColour : token['text-secondary']}
              />
            ))}
            <g clipPath={`url(#${clip})`}>
              {lines.map((line) => (
                <line
                  key={line.key}
                  x1={x(-reach * 2)}
                  y1={y(line.intercept - line.slope * reach * 2)}
                  x2={x(reach * 2)}
                  y2={y(line.intercept + line.slope * reach * 2)}
                  stroke={line.colour}
                  strokeWidth={1.5}
                  strokeDasharray={line.dashed === true ? '4 3' : undefined}
                />
              ))}
            </g>
            {/* Axis titles as py-beacon sets them: plain words, centred on the plot. */}
            <text
              className="regression-axis-title"
              x={innerWidth / 2}
              y={innerHeight + 30}
              textAnchor="middle"
              fill={token['text-primary']}
            >
              {xLabel}
            </text>
            <text
              className="regression-axis-title"
              transform={`translate(${String(-44)}, ${String(innerHeight / 2)}) rotate(-90)`}
              textAnchor="middle"
              fill={token['text-primary']}
            >
              {yLabel}
            </text>
          </Group>
        </svg>
      )}
    </div>
  )
}
