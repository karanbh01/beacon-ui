import { useMemo, useState, type MouseEvent, type ReactElement } from 'react'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { Group } from '@visx/group'
import { scaleLinear } from '@visx/scale'
import { COLORS, type ThemeMode } from '../tokens/tokens'
import { seriesColor } from './theme'
import '../components/Table/HeaderTip.css'
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

/** A name measured on its own, behind the frontier: a small dot. */
export interface CloudDot {
  name: string
  volatility: number
  expectedReturn: number
  /** Held by the fund at the end, and so drawn stronger than the rest. */
  held: boolean
  /** Further lines for its hover, after its return and volatility. */
  detail?: readonly (readonly [string, string])[]
}

/** The fund, the index or the benchmark: the style box's circle, diamond and X. */
export interface PortfolioMark {
  book: 'fund' | 'index' | 'benchmark'
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
  /** Names measured on their own, drawn small behind the frontier (BN-429). */
  cloud?: readonly CloudDot[]
  portfolios?: readonly PortfolioMark[]
  /** The y axis's title: a frontier drawn from returns seen is not an expected one. */
  returnLabel?: string
  width?: number
  height?: number
}

const MARGIN = { top: 16, right: 24, bottom: 48, left: 64 }
/** How near the pointer must come to a dot, in px, for its hover to show. */
const REACH = 9

interface Hovered {
  x: number
  y: number
  title: string
  rows: readonly (readonly [string, string])[]
}

/**
 * The efficient frontier (Figma 342:1254).
 *
 * visx rather than lightweight-charts, per ADR-0002: there is no time axis
 * here, and a scatter with a capital market line is exactly the shape that
 * ADR reserved for the d3 layer. SVG is also the right renderer at this size:
 * a frontier is tens of points, and a run's members a few thousand dots.
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
  cloud = [],
  portfolios = [],
  returnLabel = 'Expected return',
  width = 720,
  height = 460
}: FrontierChartProps): ReactElement {
  const token = COLORS[mode]
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom)
  const [hovered, setHovered] = useState<Hovered | undefined>(undefined)

  const { x, y } = useMemo(() => {
    const all = [
      ...points,
      ...markers,
      ...cloud,
      ...portfolios,
      ...(tangency === undefined ? [] : [tangency])
    ]
    const vols = all.map((point) => point.volatility)
    const returns = all.map((point) => point.expectedReturn)
    // The CML starts at the risk-free rate on the return axis, so it has to
    // be inside the domain or the line leaves the plot immediately.
    if (riskFreeRate !== undefined) returns.push(riskFreeRate)
    // A cloud of names starts where they do: from zero, a third of the plot is empty.
    const floor = cloud.length > 0 ? Math.min(...vols) : Math.min(...vols, 0)

    return {
      x: scaleLinear<number>({
        domain: [floor, Math.max(...vols, 0.01)],
        range: [0, innerWidth],
        nice: true
      }),
      y: scaleLinear<number>({
        domain: [Math.min(...returns, 0), Math.max(...returns, 0.01)],
        range: [innerHeight, 0],
        nice: true
      })
    }
  }, [points, markers, cloud, portfolios, tangency, riskFreeRate, innerWidth, innerHeight])

  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${String(x(point.volatility))},${String(y(point.expectedReturn))}`
    )
    .join(' ')

  const answers = cloud.length > 0 || portfolios.length > 0
  const hover = (event: MouseEvent<SVGRectElement>): void => {
    const box = event.currentTarget.getBoundingClientRect()
    setHovered(nearest(event.clientX - box.left, event.clientY - box.top, x, y, portfolios, cloud))
  }

  return (
    <div className="frontier-chart-block">
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
            stroke={token['text-primary']}
            tickStroke={token['text-primary']}
            // Inward, as py-beacon draws every tick.
            tickLength={-3}
            tickFormat={(value) => `${(Number(value) * 100).toFixed(0)}%`}
            tickLabelProps={() => ({
              fill: token['text-primary'],
              fontSize: 10,
              textAnchor: 'end',
              dx: -6,
              dy: 3
            })}
          />
          <AxisBottom
            top={innerHeight}
            scale={x}
            numTicks={6}
            stroke={token['text-primary']}
            tickStroke={token['text-primary']}
            tickLength={-3}
            tickFormat={(value) => `${(Number(value) * 100).toFixed(0)}%`}
            tickLabelProps={() => ({
              fill: token['text-primary'],
              fontSize: 10,
              textAnchor: 'middle',
              dy: 6
            })}
          />

          {/* The names the fund did not hold first, so its own sit on top. */}
          {[...cloud]
            .sort((one, other) => Number(one.held) - Number(other.held))
            .map((dot) => (
              <circle
                key={dot.name}
                className={dot.held ? 'frontier-held' : 'frontier-member'}
                cx={x(dot.volatility)}
                cy={y(dot.expectedReturn)}
                r={dot.held ? 2.6 : 1.7}
                fill={seriesColor(mode, 0)}
              />
            ))}

          {/* The capital market line: rf on the return axis through tangency. */}
          {riskFreeRate !== undefined && tangency !== undefined && (
            <line
              className="frontier-cml"
              x1={x(0)}
              y1={y(riskFreeRate)}
              x2={x(tangency.volatility * 1.35)}
              y2={y(riskFreeRate + (tangency.expectedReturn - riskFreeRate) * 1.35)}
              stroke={token['text-muted']}
              strokeWidth={1}
              strokeDasharray="2 1.6"
            />
          )}

          {path !== '' && (
            <path d={path} fill="none" stroke={seriesColor(mode, 0)} strokeWidth={2} />
          )}

          {/* A cloud's frontier is the curve alone: its points are where it was solved. */}
          {cloud.length === 0 &&
            points.map((point, index) => (
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
              <circle r={4} fill={markerColour(mode, marker.label)} />
              <text className="frontier-marker" x={8} y={3} fill={token['text-primary']}>
                {marker.label}
              </text>
            </Group>
          ))}

          {/* The fund last, on top of a comparator it sits beside. */}
          {[...portfolios].reverse().map((mark) => (
            <PortfolioShape
              key={mark.book}
              book={mark.book}
              x={x(mark.volatility)}
              y={y(mark.expectedReturn)}
            />
          ))}

          {/* Axis titles as py-beacon sets them: plain words, centred on the axis. */}
          <text
            className="frontier-axis-title"
            x={innerWidth / 2}
            y={innerHeight + 38}
            textAnchor="middle"
            fill={token['text-primary']}
          >
            Volatility
          </text>
          <text
            className="frontier-axis-title"
            transform={`translate(${String(-48)}, ${String(innerHeight / 2)}) rotate(-90)`}
            textAnchor="middle"
            fill={token['text-primary']}
          >
            {returnLabel}
          </text>

          {answers && (
            <rect
              width={innerWidth}
              height={innerHeight}
              fill="transparent"
              onMouseMove={hover}
              onMouseLeave={() => {
                setHovered(undefined)
              }}
            />
          )}
        </Group>
      </svg>
      {hovered !== undefined && (
        <div
          className="header-tip frontier-tip"
          role="tooltip"
          style={{ left: MARGIN.left + hovered.x, top: MARGIN.top + hovered.y }}
        >
          <div className="header-tip-title">{hovered.title}</div>
          <dl className="header-tip-params">
            {hovered.rows.map(([name, value]) => (
              <TipRow key={name} name={name} value={value} />
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}

/** The mark nearest the pointer within reach, the portfolios before the names. */
function nearest(
  left: number,
  top: number,
  x: (value: number) => number,
  y: (value: number) => number,
  portfolios: readonly PortfolioMark[],
  cloud: readonly CloudDot[]
): Hovered | undefined {
  const distance = (point: { volatility: number; expectedReturn: number }): number =>
    Math.hypot(x(point.volatility) - left, y(point.expectedReturn) - top)
  const figures = (point: {
    volatility: number
    expectedReturn: number
  }): (readonly [string, string])[] => [
    ['Return', `${(point.expectedReturn * 100).toFixed(1)}%`],
    ['Volatility', `${(point.volatility * 100).toFixed(1)}%`]
  ]
  const mark = portfolios.find((each) => distance(each) <= REACH)
  if (mark !== undefined) {
    return {
      x: x(mark.volatility),
      y: y(mark.expectedReturn),
      title: mark.label,
      rows: figures(mark)
    }
  }
  let best: CloudDot | undefined
  for (const dot of cloud) {
    if (distance(dot) > REACH) continue
    if (best === undefined || distance(dot) < distance(best)) best = dot
  }
  if (best === undefined) return undefined
  return {
    x: x(best.volatility),
    y: y(best.expectedReturn),
    title: best.name,
    rows: [...figures(best), ...(best.detail ?? [])]
  }
}

function PortfolioShape({
  book,
  x,
  y
}: {
  book: PortfolioMark['book']
  x: number
  y: number
}): ReactElement {
  if (book === 'fund') return <circle className="frontier-fund" cx={x} cy={y} r={5.5} />
  if (book === 'index') {
    return (
      <rect
        className="frontier-index"
        x={x - 5}
        y={y - 5}
        width={10}
        height={10}
        transform={`rotate(45 ${String(x)} ${String(y)})`}
      />
    )
  }
  const half = 4.5
  return (
    <path
      className="frontier-benchmark"
      d={`M${String(x - half)} ${String(y - half)}L${String(x + half)} ${String(y + half)}M${String(x + half)} ${String(y - half)}L${String(x - half)} ${String(y + half)}`}
    />
  )
}

function TipRow({ name, value }: { name: string; value: string }): ReactElement {
  return (
    <>
      <dt>{name}</dt>
      <dd>{value}</dd>
    </>
  )
}

/**
 * py-beacon's frontier marks: the minimum variance point in palette-3 and
 * the tangency point in palette-2; anything else in the lead colour.
 */
function markerColour(mode: ThemeMode, label: string): string {
  const name = label.toLowerCase()
  if (name.includes('min')) return seriesColor(mode, 2)
  if (name.includes('tang')) return seriesColor(mode, 1)
  return seriesColor(mode, 0)
}
