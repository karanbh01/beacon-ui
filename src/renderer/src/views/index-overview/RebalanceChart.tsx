import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { Group } from '@visx/group'
import { scaleBand, scaleLinear } from '@visx/scale'
import { seriesColor } from '../../charts/theme'
import { COLORS, type ThemeMode } from '../../tokens/tokens'
import { fromFraction, percent } from '../shared/indexMetrics'
import type { StepRow } from './implementationRows'

const MARGIN = { top: 12, right: 12, bottom: 28, left: 36 }

/** The bars, bottom up, each a count of names at the rebalance. */
const PARTS = [
  { key: 'removed', label: 'Removed' },
  { key: 'capped', label: 'Capped' },
  { key: 'unfilled', label: 'Unfilled' }
] as const

/**
 * Beside the rebalances table (Karan, 2026-11-20): at each rebalance, how
 * many names the screens removed, the caps cut and the orders left unfilled,
 * stacked. The cash is in the table and the hover, not drawn (Karan,
 * 2026-11-20). A bar opens its rebalance in the table, and the one open
 * there stands out.
 *
 * visx, as the frontier is: one bar per rebalance is a category axis, not
 * the continuous time axis lightweight-charts draws (ADR-0002).
 */
export function RebalanceChart({
  steps,
  mode,
  height,
  opened,
  onSelect
}: {
  steps: readonly StepRow[]
  mode: ThemeMode
  height: number
  /** The rebalance open in the table, if any. */
  opened: string | undefined
  onSelect: (date: string) => void
}): ReactElement {
  const token = COLORS[mode]
  const host = useRef<HTMLDivElement>(null)
  const width = useWidth(host)
  const [hovered, setHovered] = useState<number | undefined>(undefined)
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom)
  const colours = PARTS.map((_, at) => seriesColor(mode, at))

  const { x, count } = useMemo(
    () => ({
      x: scaleBand<string>({
        domain: steps.map((row) => row.date),
        range: [0, innerWidth],
        padding: 0.35
      }),
      count: scaleLinear<number>({
        domain: [0, Math.max(...steps.map(total), 1)],
        range: [innerHeight, 0],
        nice: true
      })
    }),
    [steps, innerWidth, innerHeight]
  )
  const middle = (date: string): number => (x(date) ?? 0) + x.bandwidth() / 2
  // About one date label for every 70px, so long runs do not crowd the axis.
  const every = Math.max(1, Math.ceil((steps.length * 70) / Math.max(innerWidth, 1)))
  const axis = { stroke: token['text-primary'], tickStroke: token['text-primary'] }
  const label = { fill: token['text-primary'], fontSize: 10 }
  const shown = hovered === undefined ? undefined : steps[hovered]
  // The bar under the pointer, else the rebalance open in the table.
  const focus = shown?.date ?? opened

  return (
    <div className="rebalance-chart" ref={host}>
      <div className="rebalance-chart-legend type-11">
        {PARTS.map((part, at) => (
          <span key={part.key}>
            <span className="rebalance-chart-swatch" style={{ background: colours[at] }} />
            {part.label}
          </span>
        ))}
      </div>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Names removed, capped and unfilled per rebalance"
        >
          <Group left={MARGIN.left} top={MARGIN.top}>
            <AxisLeft
              scale={count}
              numTicks={4}
              {...axis}
              tickLength={-3}
              tickFormat={(value) => String(value)}
              tickLabelProps={() => ({ ...label, textAnchor: 'end', dx: -6, dy: 3 })}
            />
            <AxisBottom
              top={innerHeight}
              scale={x}
              {...axis}
              tickLength={-3}
              tickValues={steps.filter((_, at) => at % every === 0).map((row) => row.date)}
              tickFormat={(date) => shortDate(date)}
              tickLabelProps={() => ({ ...label, textAnchor: 'middle', dy: 6 })}
            />
            {steps.map((row, at) => (
              <Bar
                key={row.date}
                row={row}
                left={x(row.date) ?? 0}
                width={x.bandwidth()}
                count={count}
                colours={colours}
                faded={focus !== undefined && focus !== row.date}
                onHover={(on) => {
                  setHovered(on ? at : undefined)
                }}
                onSelect={() => {
                  onSelect(row.date)
                }}
              />
            ))}
          </Group>
        </svg>
      )}
      {shown !== undefined && hovered !== undefined && (
        <div
          className="header-tip rebalance-chart-tip"
          role="tooltip"
          style={{ left: MARGIN.left + middle(shown.date), top: MARGIN.top }}
        >
          <div className="header-tip-title">{shown.date}</div>
          <dl className="header-tip-params">
            {PARTS.map((part) => (
              <FragmentRow key={part.key} name={part.label} value={String(shown[part.key])} />
            ))}
            <FragmentRow name="Cash" value={percent(fromFraction(shown.cashWeight), 2)} />
          </dl>
        </div>
      )}
    </div>
  )
}

function Bar({
  row,
  left,
  width,
  count,
  colours,
  faded,
  onHover,
  onSelect
}: {
  row: StepRow
  left: number
  width: number
  count: (value: number) => number
  colours: readonly string[]
  faded: boolean
  onHover: (on: boolean) => void
  onSelect: () => void
}): ReactElement {
  let below = 0
  return (
    <g
      className="rebalance-chart-bar"
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
      <rect x={left} y={0} width={width} height={count(0)} fill="transparent" />
      {PARTS.map((part, at) => {
        const value = row[part.key]
        const top = count(below + value)
        const bottom = count(below)
        below += value
        return value === 0 ? null : (
          <rect
            key={part.key}
            x={left}
            y={top}
            width={width}
            height={bottom - top}
            fill={colours[at]}
          />
        )
      })}
    </g>
  )
}

function FragmentRow({ name, value }: { name: string; value: string }): ReactElement {
  return (
    <>
      <dt>{name}</dt>
      <dd>{value}</dd>
    </>
  )
}

function total(row: StepRow): number {
  return row.removed + row.capped + row.unfilled
}

/** "2023-04-21" as "Apr 23". */
function shortDate(date: string): string {
  const month = MONTHS[Number(date.slice(5, 7)) - 1] ?? ''
  return `${month} ${date.slice(2, 4)}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The element's width, kept as it resizes. */
function useWidth(host: { current: HTMLDivElement | null }): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = host.current
    if (element === null) return undefined
    const watcher = new ResizeObserver(() => {
      setWidth(element.clientWidth)
    })
    watcher.observe(element)
    setWidth(element.clientWidth)
    return () => {
      watcher.disconnect()
    }
  }, [host])
  return width
}
