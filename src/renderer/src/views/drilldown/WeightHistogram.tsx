import { useState, type ReactElement } from 'react'
import { HoverTip } from '../index-overview/HoverTip'
import { columnOf, numberIn, type Part } from './profile'

/** How many weights the histogram is cut into between the lightest and the heaviest. */
const BINS = 24
/** The curve's box: as wide as it is drawn in percent, as tall as the strip in px. */
const WIDE = 100
const TALL = 56
/** Binomial weights each count is evened with before the curve is drawn through them. */
const EVEN = [1, 4, 6, 4, 1]

const percent = (value: number): string => `${(value * 100).toFixed(2)}%`

interface Bin {
  from: number
  to: number
}

/** One portfolio's days at each weight, over the bins every curve shares. */
interface Curve {
  portfolio: string
  label: string
  /** The days it held the name. */
  held: number
  days: number[]
  latest: number | undefined
}

/**
 * How long the fund held the name at each weight (Karan, 2026-11-26): the
 * days it was held, counted by weight from the lightest to the heaviest and
 * drawn as one smooth curve, so a reader sees where it usually sat and how
 * far it drifted. The index's days are a line over it, and a benchmark
 * other than the index a grey one (Karan, 2026-11-27), each as a share of
 * the days that portfolio held the name so a fund that held it a few months
 * reads against an index that held it all run. The hover popup gives each
 * step's own counts; a tick marks the fund's latest weight. Days a
 * portfolio did not hold the name are left out of its curve.
 */
export function WeightHistogram({
  daily,
  benchmarkIsIndex
}: {
  daily: Part | undefined
  benchmarkIsIndex: boolean
}): ReactElement {
  const [hovered, setHovered] = useState<number | undefined>(undefined)
  const rows = daily?.rows ?? []
  const shown = ['fund', 'index', ...(benchmarkIsIndex ? [] : ['benchmark'])].filter(
    (portfolio) => columnOf(daily, portfolio) !== undefined
  )
  const heldBy = (portfolio: string): number[] =>
    rows.map((row) => numberIn(row, portfolio) ?? 0).filter((weight) => weight > 0)
  const fundHeld = heldBy('fund')
  if (fundHeld.length === 0) {
    return (
      <div className="weight-histogram-none">
        <p className="summary-profile-none type-11">Not held over this run</p>
      </div>
    )
  }
  const every = shown.flatMap(heldBy)
  const least = Math.min(...every)
  const most = Math.max(...every)
  const bins = binsOf(least, most)
  const span = Math.max(most - least, 1e-9)
  const placeOf = (weight: number): number =>
    Math.min(100, Math.max(0, ((weight - least) / span) * 100))

  const last = rows.at(-1)
  const curves: Curve[] = shown.map((portfolio) => {
    const weights = heldBy(portfolio)
    return {
      portfolio,
      label:
        portfolio === 'index' && benchmarkIsIndex
          ? 'Index/benchmark'
          : (columnOf(daily, portfolio)?.label ?? portfolio),
      held: weights.length,
      days: countsOf(weights, bins, least),
      latest: numberIn(last, portfolio)
    }
  })
  const shares = curves.map((curve) =>
    evened(curve.days).map((days) => days / Math.max(curve.held, 1))
  )
  const tallest = Math.max(...shares.flat(), 1e-9)
  const fund = curves[0]
  const bin = hovered === undefined ? undefined : bins[hovered]

  return (
    <HoverTip
      className="weight-histogram"
      tip={
        <>
          <div className="header-tip-title">
            {bin === undefined
              ? `${percent(fund?.latest ?? 0)} of the fund now`
              : `${percent(bin.from)} to ${percent(bin.to)}`}
          </div>
          {bin === undefined && (
            <div>{`${percent(Math.min(...fundHeld))} to ${percent(Math.max(...fundHeld))} while held`}</div>
          )}
          {curves.map((curve) =>
            hovered === undefined ? (
              curve.portfolio !== 'fund' &&
              curve.latest !== undefined && (
                <div key={curve.portfolio} className="header-tip-kind">
                  {`${percent(curve.latest)} of the ${curve.label.toLowerCase()} now`}
                </div>
              )
            ) : (
              <div key={curve.portfolio}>{daysIn(curve, hovered)}</div>
            )
          )}
          <div className="header-tip-kind">{`Held on ${String(fundHeld.length)} of ${String(rows.length)} days`}</div>
        </>
      }
    >
      <div
        className="weight-histogram-bars"
        aria-label={`${percent(fund?.latest ?? 0)} of the fund`}
        onMouseLeave={() => {
          setHovered(undefined)
        }}
      >
        <svg
          className="weight-histogram-curve"
          viewBox={`0 0 ${String(WIDE)} ${String(TALL)}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {/* The comparators first, so the fund's line sits on top where they cross. */}
          {[...curves.keys()].reverse().map((at) => {
            const curve = curves[at]
            const heights = shares[at]
            if (curve === undefined || heights === undefined) return null
            return curve.portfolio === 'fund' ? (
              <g key={curve.portfolio}>
                <path className="weight-histogram-area" d={curveOf(heights, tallest, true)} />
                <path className="weight-histogram-line" d={curveOf(heights, tallest, false)} />
              </g>
            ) : (
              <path
                key={curve.portfolio}
                className={`weight-histogram-line is-${curve.portfolio}`}
                d={curveOf(heights, tallest, false)}
              />
            )
          })}
        </svg>
        {bins.map((_, at) => (
          <span
            key={at}
            className={at === hovered ? 'weight-histogram-bin is-hovered' : 'weight-histogram-bin'}
            onMouseEnter={() => {
              setHovered(at)
            }}
          />
        ))}
        <span
          className="weight-histogram-latest"
          style={{ left: `${String(placeOf(fund?.latest ?? 0))}%` }}
        />
      </div>
      <div className="weight-histogram-axis type-11">
        <span>{percent(least)}</span>
        <span>{percent(most)}</span>
      </div>
      {curves.length > 1 && (
        <div className="weight-histogram-legend type-11">
          {curves.map((curve) => (
            <span key={curve.portfolio}>
              <svg width={12} height={10} aria-hidden="true">
                <line
                  className={`weight-histogram-key is-${curve.portfolio}`}
                  x1={0}
                  x2={12}
                  y1={5}
                  y2={5}
                />
              </svg>
              {curve.label}
            </span>
          ))}
        </div>
      )}
    </HoverTip>
  )
}

function daysIn(curve: Curve, at: number): string {
  const days = curve.days[at] ?? 0
  return `${String(days)} ${days === 1 ? 'day' : 'days'} in the ${curve.label.toLowerCase()}`
}

/** Even steps of weight between the lightest and the heaviest; one step when no weight ever moved. */
function binsOf(least: number, most: number): Bin[] {
  const count = most - least < 1e-9 ? 1 : BINS
  const step = (most - least) / count
  return Array.from({ length: count }, (_, at) => ({
    from: least + step * at,
    to: least + step * (at + 1)
  }))
}

function countsOf(weights: readonly number[], bins: readonly Bin[], least: number): number[] {
  const counts = bins.map(() => 0)
  const step = (bins[0]?.to ?? least) - least
  for (const weight of weights) {
    const at =
      bins.length === 1 ? 0 : Math.min(bins.length - 1, Math.floor((weight - least) / step))
    counts[at] = (counts[at] ?? 0) + 1
  }
  return counts
}

/** The counts evened a little, so single days do not spike the curve. */
function evened(counts: readonly number[]): number[] {
  return counts.map((_, at) => {
    let sum = 0
    let weight = 0
    EVEN.forEach((share, offset) => {
      const days = counts[at + offset - 2]
      if (days === undefined) return
      sum += days * share
      weight += share
    })
    return sum / weight
  })
}

/**
 * Heights as a smooth curve over the strip, drawn through each step's
 * middle with Catmull-Rom curves; as an area to the baseline, or the line
 * along its top. Every curve takes the same tallest, so they read together.
 */
function curveOf(heights: readonly number[], tallest: number, area: boolean): string {
  const points = heights.map((height, at) => ({
    x: ((at + 0.5) / heights.length) * WIDE,
    y: TALL - (height / tallest) * (TALL - 1)
  }))
  const first = points[0]
  const last = points.at(-1)
  if (first === undefined || last === undefined) return ''
  // Flat to each edge, so the curve spans the strip as the steps do.
  const line = [{ x: 0, y: first.y }, ...points, { x: WIDE, y: last.y }]
  const clamp = (y: number): number => Math.min(TALL, Math.max(0, y))
  let path = `M0 ${fixed(first.y)}`
  for (let at = 0; at < line.length - 1; at += 1) {
    const before = line[Math.max(0, at - 1)] ?? first
    const from = line[at] ?? first
    const to = line[at + 1] ?? last
    const after = line[Math.min(line.length - 1, at + 2)] ?? last
    const one = { x: from.x + (to.x - before.x) / 6, y: clamp(from.y + (to.y - before.y) / 6) }
    const two = { x: to.x - (after.x - from.x) / 6, y: clamp(to.y - (after.y - from.y) / 6) }
    path += `C${fixed(one.x)} ${fixed(one.y)} ${fixed(two.x)} ${fixed(two.y)} ${fixed(to.x)} ${fixed(to.y)}`
  }
  return area ? `${path}L${String(WIDE)} ${String(TALL)}L0 ${String(TALL)}Z` : path
}

const fixed = (value: number): string => value.toFixed(2)
