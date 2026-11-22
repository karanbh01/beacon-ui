import { useMemo, useRef, useState, type ReactElement } from 'react'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { Group } from '@visx/group'
import { scaleLinear } from '@visx/scale'
import { COLORS, type ThemeMode } from '../tokens/tokens'
import { seriesColor } from './theme'
import { useWidth } from './useWidth'
import '../components/Table/HeaderTip.css'
import './DistributionChart.css'

/** One bin of returns: each book's share of its own periods, and a normal's. */
export interface DistributionBin {
  low: number
  high: number
  fund: number
  index?: number | undefined
  benchmark?: number | undefined
  normal: number
}

export interface DistributionChartProps {
  bins: readonly DistributionBin[]
  mode: ThemeMode
  height: number
  /** The loss at the chosen level, positive: the bars beyond it are the tail. */
  valueAtRisk?: number | undefined
  /** The average loss beyond it, positive, dashed in the tail. */
  expectedShortfall?: number | undefined
  /** What the legend calls the line and the mark, with their figures. */
  riskLabels: { valueAtRisk: string; expectedShortfall: string }
  /** Names for the comparators' outlines; absent when the run lacks one. */
  names: { index?: string | undefined; benchmark?: string | undefined }
  label: string
}

const MARGIN = { top: 12, right: 12, bottom: 30, left: 44 }

const percent = (value: number, digits: number): string => `${(value * 100).toFixed(digits)}%`

/**
 * The fund's returns as a histogram, with value at risk drawn on it
 * (Karan, 2026-11-21): the fund's bars, the index's as an outline over them,
 * a normal of the fund's own mean and spread dashed through, and the VaR
 * line with the tail beyond it in the loss colour. Shares of days rather
 * than counts, so books with different histories read on one scale.
 *
 * visx, per ADR-0002: a value axis, not a time one.
 */
export function DistributionChart({
  bins,
  mode,
  height,
  valueAtRisk,
  expectedShortfall,
  riskLabels,
  names,
  label
}: DistributionChartProps): ReactElement {
  const token = COLORS[mode]
  const host = useRef<HTMLDivElement>(null)
  const width = useWidth(host)
  const [hovered, setHovered] = useState<number | undefined>(undefined)
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const { x, y } = useMemo(() => {
    const tallest = Math.max(
      ...bins.flatMap((bin) => [bin.fund, bin.index ?? 0, bin.benchmark ?? 0, bin.normal]),
      0.01
    )
    return {
      x: scaleLinear<number>({
        domain: [bins[0]?.low ?? -0.05, bins.at(-1)?.high ?? 0.05],
        range: [0, innerWidth]
      }),
      y: scaleLinear<number>({ domain: [0, tallest * 1.08], range: [innerHeight, 0], nice: true })
    }
  }, [bins, innerWidth, innerHeight])

  const outline = (share: (bin: DistributionBin) => number | undefined): string =>
    bins
      .map(
        (bin, at) =>
          `${at === 0 ? `M${String(x(bin.low))},${String(y(0))}V` : 'V'}${String(y(share(bin) ?? 0))}H${String(x(bin.high))}`
      )
      .join('') + `V${String(y(0))}`
  const normal = bins
    .map(
      (bin, at) =>
        `${at === 0 ? 'M' : 'L'}${String(x((bin.low + bin.high) / 2))},${String(y(bin.normal))}`
    )
    .join('')
  const cut = valueAtRisk === undefined ? undefined : -valueAtRisk
  const text = { fill: token['text-primary'], fontSize: 10 }
  const axis = { stroke: token['text-primary'], tickStroke: token['text-primary'] }
  const shown = hovered === undefined ? undefined : bins[hovered]

  return (
    <div className="distribution" ref={host}>
      <div className="distribution-legend type-11">
        <Swatch className="distribution-swatch-fund" label="Fund" />
        {names.index !== undefined && (
          <Swatch line colour={seriesColor(mode, 1)} label={names.index} />
        )}
        {names.benchmark !== undefined && (
          <Swatch line colour={seriesColor(mode, 2)} label={names.benchmark} />
        )}
        <Swatch className="distribution-swatch-normal" label="Normal" />
        {cut !== undefined && (
          <Swatch className="distribution-swatch-var" label={riskLabels.valueAtRisk} />
        )}
        {expectedShortfall !== undefined && (
          <Swatch className="distribution-swatch-es" label={riskLabels.expectedShortfall} />
        )}
      </div>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          <Group left={MARGIN.left} top={MARGIN.top}>
            <AxisLeft
              scale={y}
              numTicks={4}
              {...axis}
              tickLength={-3}
              tickFormat={(tick) => percent(Number(tick), 0)}
              tickLabelProps={() => ({ ...text, textAnchor: 'end', dx: -6, dy: 3 })}
            />
            <AxisBottom
              top={innerHeight}
              scale={x}
              numTicks={6}
              {...axis}
              tickLength={-3}
              tickFormat={(tick) => percent(Number(tick), 1)}
              tickLabelProps={() => ({ ...text, textAnchor: 'middle', dy: 6 })}
            />
            {bins.map((bin, at) => (
              <rect
                key={at}
                className={
                  cut !== undefined && (bin.low + bin.high) / 2 < cut
                    ? 'distribution-bar distribution-tail'
                    : 'distribution-bar'
                }
                x={x(bin.low) + 0.5}
                y={y(bin.fund)}
                width={Math.max(0, x(bin.high) - x(bin.low) - 1)}
                height={Math.max(0, y(0) - y(bin.fund))}
                opacity={hovered === undefined || hovered === at ? 1 : 0.55}
              />
            ))}
            {names.index !== undefined && (
              <path
                className="distribution-outline"
                d={outline((bin) => bin.index)}
                stroke={seriesColor(mode, 1)}
              />
            )}
            {names.benchmark !== undefined && (
              <path
                className="distribution-outline"
                d={outline((bin) => bin.benchmark)}
                stroke={seriesColor(mode, 2)}
              />
            )}
            <path className="distribution-normal" d={normal} />
            {cut !== undefined && (
              <line className="distribution-var" x1={x(cut)} x2={x(cut)} y1={0} y2={innerHeight} />
            )}
            {expectedShortfall !== undefined && (
              <line
                className="distribution-es"
                x1={x(-expectedShortfall)}
                x2={x(-expectedShortfall)}
                y1={0}
                y2={innerHeight}
              />
            )}
            {bins.map((bin, at) => (
              <rect
                key={`hit-${String(at)}`}
                x={x(bin.low)}
                width={Math.max(0, x(bin.high) - x(bin.low))}
                height={innerHeight}
                fill="transparent"
                onMouseEnter={() => {
                  setHovered(at)
                }}
                onMouseLeave={() => {
                  setHovered(undefined)
                }}
              />
            ))}
          </Group>
        </svg>
      )}
      {shown !== undefined && (
        <div
          className="header-tip distribution-tip"
          role="tooltip"
          style={{ left: MARGIN.left + x((shown.low + shown.high) / 2), top: MARGIN.top + 18 }}
        >
          <div className="header-tip-title">
            {percent(shown.low, 2)} to {percent(shown.high, 2)}
          </div>
          <dl className="header-tip-params">
            <TipRow name="Fund" value={`${percent(shown.fund, 1)} of days`} />
            {names.index !== undefined && (
              <TipRow name={names.index} value={`${percent(shown.index ?? 0, 1)} of days`} />
            )}
            {names.benchmark !== undefined && (
              <TipRow
                name={names.benchmark}
                value={`${percent(shown.benchmark ?? 0, 1)} of days`}
              />
            )}
            <TipRow name="Normal" value={`${percent(shown.normal, 1)} of days`} />
          </dl>
        </div>
      )}
    </div>
  )
}

function Swatch({
  label,
  className,
  colour,
  line = false
}: {
  label: string
  className?: string
  colour?: string
  line?: boolean
}): ReactElement {
  return (
    <span>
      <span
        className={`distribution-swatch ${line ? 'distribution-swatch-line' : ''} ${className ?? ''}`}
        style={colour === undefined ? undefined : { borderColor: colour }}
      />
      {label}
    </span>
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
