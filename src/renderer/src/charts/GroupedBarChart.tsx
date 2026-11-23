import { useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { Group } from '@visx/group'
import { scaleBand, scaleLinear } from '@visx/scale'
import { COLORS, type ThemeMode } from '../tokens/tokens'
import '../components/Table/HeaderTip.css'
import type { BarSeries } from './StackedBarChart'
import { useWidth } from './useWidth'
import './GroupedBarChart.css'

export interface GroupedBarChartProps {
  /** One group of bars each, in order. */
  categories: readonly string[]
  /** A bar in every group, side by side in this order. */
  series: readonly BarSeries[]
  /** A bar's value; undefined draws none. */
  value: (category: string, series: string) => number | undefined
  mode: ThemeMode
  height: number
  /** How the y axis reads a value. */
  tickFormat: (value: number) => string
  /** How the hover reads one. */
  format: (value: number) => string
  /** Groups on view elsewhere, such as in a table beside it, under the selection wash. */
  shaded?: ReadonlySet<string>
  /** A group to stand out, the others faded. */
  focus?: string | undefined
  /** The group under the pointer, or none. */
  onHover?: (category: string | undefined) => void
  onSelect?: (category: string) => void
  /** A control at the start of the legend's row, such as what the bars measure. */
  legendStart?: ReactNode
  label: string
}

const MARGIN = { top: 10, right: 8, bottom: 24, left: 48 }

/**
 * Bars side by side in each category: the fund's, the index's and the
 * benchmark's return in each calendar period (Karan, 2026-11-23). The
 * stacked chart's sibling, on the same visx axes (ADR-0002).
 */
export function GroupedBarChart({
  categories,
  series,
  value,
  mode,
  height,
  tickFormat,
  format,
  shaded,
  focus,
  onHover,
  onSelect,
  legendStart,
  label
}: GroupedBarChartProps): ReactElement {
  const token = COLORS[mode]
  const host = useRef<HTMLDivElement>(null)
  const width = useWidth(host)
  const [hovered, setHovered] = useState<string | undefined>(undefined)
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const { x, inner, y } = useMemo(() => {
    const values = categories.flatMap((category) =>
      series.flatMap((part) => value(category, part.key) ?? [])
    )
    const x = scaleBand<string>({ domain: [...categories], range: [0, innerWidth], padding: 0.25 })
    return {
      x,
      inner: scaleBand<string>({
        domain: series.map((part) => part.key),
        range: [0, x.bandwidth()],
        padding: 0.08
      }),
      y: scaleLinear<number>({
        domain: [Math.min(...values, 0), Math.max(...values, 0) || 1],
        range: [innerHeight, 0],
        nice: true
      })
    }
  }, [categories, series, value, innerWidth, innerHeight])

  const hover = (category: string | undefined): void => {
    setHovered(category)
    onHover?.(category)
  }
  // About one label for every 56px, so a run of months does not crowd the axis.
  const every = Math.max(1, Math.ceil((categories.length * 56) / Math.max(innerWidth, 1)))
  const axis = { stroke: token['text-primary'], tickStroke: token['text-primary'] }
  const text = { fill: token['text-primary'], fontSize: 10 }
  const lit = hovered ?? focus
  const wash = washOf(categories, shaded, x)

  return (
    <div className="grouped-bars" ref={host}>
      <div className="grouped-bars-legend type-11">
        {legendStart}
        <span className="grouped-bars-names">
          {series.map((part) => (
            <span key={part.key}>
              <span className="grouped-bars-swatch" style={{ background: part.colour }} />
              {part.label}
            </span>
          ))}
        </span>
      </div>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          <Group left={MARGIN.left} top={MARGIN.top}>
            {wash !== undefined && (
              <rect
                x={wash.from}
                y={0}
                width={wash.to - wash.from}
                height={innerHeight}
                fill={token['sidebar-active-bg']}
              />
            )}
            <AxisLeft
              scale={y}
              numTicks={4}
              {...axis}
              tickLength={-3}
              tickFormat={(tick) => tickFormat(Number(tick))}
              tickLabelProps={() => ({ ...text, textAnchor: 'end', dx: -6, dy: 3 })}
            />
            {/* The names along the bottom, clear of bars below nothing; nothing its own rule. */}
            <AxisBottom
              top={innerHeight}
              scale={x}
              {...axis}
              tickLength={-3}
              tickValues={categories.filter((_, at) => at % every === 0)}
              tickLabelProps={() => ({ ...text, textAnchor: 'middle', dy: 6 })}
            />
            <line x1={0} x2={innerWidth} y1={y(0)} y2={y(0)} stroke={token['text-secondary']} />
            {categories.map((category) => (
              <g
                key={category}
                className={onSelect === undefined ? undefined : 'grouped-bars-open'}
                opacity={lit !== undefined && lit !== category ? 0.4 : 1}
                onMouseEnter={() => {
                  hover(category)
                }}
                onMouseLeave={() => {
                  hover(undefined)
                }}
                onClick={() => onSelect?.(category)}
              >
                {/* The whole column answers the pointer, not only its bars. */}
                <rect
                  x={(x(category) ?? 0) - (x.step() - x.bandwidth()) / 2}
                  y={0}
                  width={x.step()}
                  height={innerHeight}
                  fill="transparent"
                />
                {series.map((part) => {
                  const amount = value(category, part.key)
                  if (amount === undefined) return null
                  return (
                    <rect
                      key={part.key}
                      x={(x(category) ?? 0) + (inner(part.key) ?? 0)}
                      y={Math.min(y(0), y(amount))}
                      width={inner.bandwidth()}
                      height={Math.abs(y(0) - y(amount))}
                      fill={part.colour}
                    />
                  )
                })}
              </g>
            ))}
          </Group>
        </svg>
      )}
      {hovered !== undefined && (
        <div
          className="header-tip grouped-bars-tip"
          role="tooltip"
          style={{ left: MARGIN.left + (x(hovered) ?? 0) + x.bandwidth() / 2, top: MARGIN.top }}
        >
          <div className="header-tip-title">{hovered}</div>
          <dl className="header-tip-params">
            {series.map((part) => {
              const amount = value(hovered, part.key)
              return (
                <TipRow
                  key={part.key}
                  name={part.label}
                  value={amount === undefined ? '—' : format(amount)}
                />
              )
            })}
          </dl>
        </div>
      )}
    </div>
  )
}

/** The span behind the shaded groups, from the first to the last, gaps included. */
function washOf(
  categories: readonly string[],
  shaded: ReadonlySet<string> | undefined,
  x: { (category: string): number | undefined; step: () => number; bandwidth: () => number }
): { from: number; to: number } | undefined {
  if (shaded === undefined || shaded.size === 0 || shaded.size === categories.length)
    return undefined
  const inside = categories.filter((category) => shaded.has(category))
  const first = inside[0]
  const last = inside[inside.length - 1]
  if (first === undefined || last === undefined) return undefined
  const half = (x.step() - x.bandwidth()) / 2
  return { from: (x(first) ?? 0) - half, to: (x(last) ?? 0) + x.bandwidth() + half }
}

function TipRow({ name, value }: { name: string; value: string }): ReactElement {
  return (
    <>
      <dt>{name}</dt>
      <dd>{value}</dd>
    </>
  )
}
