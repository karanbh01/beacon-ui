import { useMemo, useRef, useState, type ReactElement } from 'react'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { Group } from '@visx/group'
import { scaleBand, scaleLinear } from '@visx/scale'
import { COLORS, type ThemeMode } from '../tokens/tokens'
import '../components/Table/HeaderTip.css'
import { useWidth } from './useWidth'
import './StackedBarChart.css'

/** One stacked part of every bar, with its legend name and colour. */
export interface BarSeries {
  key: string
  label: string
  colour: string
}

export interface StackedBarChartProps {
  /** One bar each, in order: its key, and what the axis and hover call it. */
  categories: readonly string[]
  series: readonly BarSeries[]
  /** A part's value in a bar; zero draws nothing. */
  value: (category: string, series: string) => number
  mode: ThemeMode
  height: number
  /** How the y axis and the hover read a value. */
  format: (value: number) => string
  /** A bar's name on the x axis; the category itself when omitted. */
  tickLabel?: (category: string) => string
  /** Further lines for a bar's hover, after its parts. */
  tipExtra?: (category: string) => readonly (readonly [string, string])[]
  /** A bar to stand out, the others faded, when none is under the pointer. */
  focus?: string | undefined
  /** Clicking a bar, when the bars open something. */
  onSelect?: (category: string) => void
  /**
   * A level each bar is read against, as a dashed line across the bars:
   * a rule's threshold under a name's value (Karan, 2026-11-27). A step
   * where it changes from one category to the next.
   */
  reference?: {
    label: string
    value: (category: string) => number | undefined
    /** A shaded band this share of the level either side of it, such as a near miss's. */
    band?: { share: number; label: string }
  }
  label: string
}

const MARGIN = { top: 12, right: 12, bottom: 28, left: 52 }

/**
 * Bars by category, each stacked from its parts, above zero for a positive
 * part and below for a negative one: a rebalance's names, or a dealing day's
 * flows by share class (Karan, 2026-11-20). One bar per category, so dates
 * with nothing between them sit side by side rather than on a calendar.
 *
 * visx, as the frontier is: a category axis, not the continuous time axis
 * lightweight-charts draws (ADR-0002).
 */
export function StackedBarChart({
  categories,
  series,
  value,
  mode,
  height,
  format,
  tickLabel = (category) => category,
  tipExtra,
  focus,
  onSelect,
  reference,
  label
}: StackedBarChartProps): ReactElement {
  const token = COLORS[mode]
  const host = useRef<HTMLDivElement>(null)
  const width = useWidth(host)
  const [hovered, setHovered] = useState<string | undefined>(undefined)
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const { x, y } = useMemo(() => {
    const totals = categories.map((category) => {
      const parts = series.map((part) => value(category, part.key))
      return {
        up: parts.filter((part) => part > 0).reduce((sum, part) => sum + part, 0),
        down: parts.filter((part) => part < 0).reduce((sum, part) => sum + part, 0)
      }
    })
    const share = reference?.band?.share ?? 0
    const levels = categories.flatMap((category) => {
      const level = reference?.value(category)
      if (level === undefined) return []
      return [level - Math.abs(level) * share, level + Math.abs(level) * share]
    })
    return {
      x: scaleBand<string>({ domain: [...categories], range: [0, innerWidth], padding: 0.35 }),
      y: scaleLinear<number>({
        domain: [
          Math.min(...totals.map((total) => total.down), ...levels, 0),
          Math.max(...totals.map((total) => total.up), ...levels, 0) || 1
        ],
        range: [innerHeight, 0],
        nice: true
      })
    }
  }, [categories, series, value, reference, innerWidth, innerHeight])

  // About one label for every 70px, so long runs do not crowd the axis.
  const every = Math.max(1, Math.ceil((categories.length * 70) / Math.max(innerWidth, 1)))
  const axis = { stroke: token['text-primary'], tickStroke: token['text-primary'] }
  const text = { fill: token['text-primary'], fontSize: 10 }
  const lit = hovered ?? focus

  return (
    <div className="stacked-bars" ref={host}>
      <div className="stacked-bars-legend type-11">
        {series.map((part) => (
          <span key={part.key}>
            <span className="stacked-bars-swatch" style={{ background: part.colour }} />
            {part.label}
          </span>
        ))}
        {reference?.band !== undefined && (
          <span>
            <span className="stacked-bars-swatch stacked-bars-band" />
            {reference.band.label}
          </span>
        )}
        {reference !== undefined && (
          <span>
            <svg width={12} height={8} aria-hidden="true">
              <line className="stacked-bars-reference" x1={0} x2={12} y1={4} y2={4} />
            </svg>
            {reference.label}
          </span>
        )}
      </div>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          <Group left={MARGIN.left} top={MARGIN.top}>
            {reference?.band !== undefined && (
              <path
                className="stacked-bars-band"
                d={bandPath(categories, reference.value, reference.band.share, x, y)}
              />
            )}
            <AxisLeft
              scale={y}
              numTicks={4}
              {...axis}
              tickLength={-3}
              tickFormat={(tick) => format(Number(tick))}
              tickLabelProps={() => ({ ...text, textAnchor: 'end', dx: -6, dy: 3 })}
            />
            <AxisBottom
              top={y(0)}
              scale={x}
              {...axis}
              tickLength={-3}
              tickValues={categories.filter((_, at) => at % every === 0)}
              tickFormat={tickLabel}
              tickLabelProps={() => ({ ...text, textAnchor: 'middle', dy: 6 })}
            />
            {categories.map((category) => (
              <Bar
                key={category}
                category={category}
                series={series}
                value={value}
                left={x(category) ?? 0}
                width={x.bandwidth()}
                y={y}
                height={innerHeight}
                faded={lit !== undefined && lit !== category}
                onHover={(on) => {
                  setHovered(on ? category : undefined)
                }}
                {...(onSelect === undefined
                  ? {}
                  : {
                      onSelect: () => {
                        onSelect(category)
                      }
                    })}
              />
            ))}
            {reference !== undefined && (
              <path
                className="stacked-bars-reference"
                d={referencePath(categories, reference.value, x, y)}
              />
            )}
          </Group>
        </svg>
      )}
      {hovered !== undefined && (
        <div
          className="header-tip stacked-bars-tip"
          role="tooltip"
          style={{
            left: MARGIN.left + (x(hovered) ?? 0) + x.bandwidth() / 2,
            top: MARGIN.top
          }}
        >
          <div className="header-tip-title">{tickLabel(hovered)}</div>
          <dl className="header-tip-params">
            {series.map((part) => (
              <TipRow key={part.key} name={part.label} value={format(value(hovered, part.key))} />
            ))}
            {reference !== undefined && (
              <TipRow
                name={reference.label}
                value={(() => {
                  const level = reference.value(hovered)
                  return level === undefined ? '—' : format(level)
                })()}
              />
            )}
            {(tipExtra?.(hovered) ?? []).map(([name, figure]) => (
              <TipRow key={name} name={name} value={figure} />
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}

function Bar({
  category,
  series,
  value,
  left,
  width,
  y,
  height,
  faded,
  onHover,
  onSelect
}: {
  category: string
  series: readonly BarSeries[]
  value: (category: string, series: string) => number
  left: number
  width: number
  y: (value: number) => number
  height: number
  faded: boolean
  onHover: (on: boolean) => void
  onSelect?: () => void
}): ReactElement {
  // Each part stacks on those before it on its own side of zero.
  let up = 0
  let down = 0
  return (
    <g
      className={onSelect === undefined ? 'stacked-bars-bar' : 'stacked-bars-bar stacked-bars-open'}
      opacity={faded ? 0.45 : 1}
      onMouseEnter={() => {
        onHover(true)
      }}
      onMouseLeave={() => {
        onHover(false)
      }}
      onClick={onSelect}
    >
      {/* The whole column answers the pointer, not only the coloured part. */}
      <rect x={left} y={0} width={width} height={height} fill="transparent" />
      {series.map((part) => {
        const amount = value(category, part.key)
        if (amount === 0) return null
        const from = amount > 0 ? up : down
        const to = from + amount
        if (amount > 0) up = to
        else down = to
        return (
          <rect
            key={part.key}
            x={left}
            y={Math.min(y(from), y(to))}
            width={width}
            height={Math.abs(y(from) - y(to))}
            fill={part.colour}
          />
        )
      })}
    </g>
  )
}

/**
 * The reference as a step: level across each category's whole step, the
 * padding either side included, so a level that holds reads as one line.
 */
function referencePath(
  categories: readonly string[],
  value: (category: string) => number | undefined,
  x: ReturnType<typeof scaleBand<string>>,
  y: (value: number) => number
): string {
  const half = (x.step() - x.bandwidth()) / 2
  let path = ''
  let drawing = false
  for (const category of categories) {
    const level = value(category)
    if (level === undefined) {
      drawing = false
      continue
    }
    const from = (x(category) ?? 0) - half
    const to = from + x.step()
    const at = y(level).toFixed(1)
    path += `${drawing ? 'L' : 'M'}${from.toFixed(1)} ${at}H${to.toFixed(1)}`
    drawing = true
  }
  return path
}

/** The band as a step of boxes, each across a category's whole step, behind the bars. */
function bandPath(
  categories: readonly string[],
  value: (category: string) => number | undefined,
  share: number,
  x: ReturnType<typeof scaleBand<string>>,
  y: (value: number) => number
): string {
  const half = (x.step() - x.bandwidth()) / 2
  return categories
    .map((category) => {
      const level = value(category)
      if (level === undefined) return ''
      const reach = Math.abs(level) * share
      const top = y(level + reach)
      const bottom = y(level - reach)
      const from = (x(category) ?? 0) - half
      return `M${from.toFixed(1)} ${top.toFixed(1)}h${x.step().toFixed(1)}V${bottom.toFixed(1)}h${(-x.step()).toFixed(1)}Z`
    })
    .join('')
}

function TipRow({ name, value }: { name: string; value: string }): ReactElement {
  return (
    <>
      <dt>{name}</dt>
      <dd>{value}</dd>
    </>
  )
}
