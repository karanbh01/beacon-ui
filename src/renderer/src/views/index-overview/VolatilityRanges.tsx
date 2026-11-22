import type { ReactElement } from 'react'
import { percent } from '../shared/indexMetrics'
import { HoverTip } from './HoverTip'

export interface VolatilityRange {
  /** What the matrix's row calls it, and its full name for the hover. */
  head: string
  name: string
  low: number
  high: number
  latest: number | undefined
}

/**
 * Beside the correlation matrix, a row for each of its rows (Karan,
 * 2026-11-22): the lowest to the highest one-year volatility over the run as
 * a line coloured from calm to stormy on one gradient across the whole
 * scale, its two ends written beside it, and where it is now as a circle.
 * One scale for every row and no axes or frame, so it reads as part of the
 * matrix rather than a chart of its own.
 */
/**
 * Where the scale is split into bands, and each band's name (Karan,
 * 2026-11-22). Plain levels for now; the risk box's factsheet bounds are the
 * other choice.
 */
const BANDS: readonly { label: string; from: number; to: number }[] = [
  { label: 'Low', from: 0, to: 0.1 },
  { label: 'Medium', from: 0.1, to: 0.2 },
  { label: 'High', from: 0.2, to: Infinity }
]
/** A band narrower than this, in percent of the scale, goes unnamed: its name would not fit. */
const NAMEABLE = 18

export function VolatilityRanges({
  ranges,
  row
}: {
  /** In the matrix's row order. */
  ranges: readonly (VolatilityRange | undefined)[]
  /** The matrix's row height, so each bar sits on its row. */
  row: number
}): ReactElement {
  const shown = ranges.filter((range) => range !== undefined)
  const floor = Math.min(...shown.map((range) => range.low))
  const top = Math.max(...shown.map((range) => range.high))
  const span = top - floor || 0.01
  const along = (value: number): number => ((value - floor) / span) * 100
  // Each band as much of it as the scale reaches, where it starts and ends along it.
  const bands = BANDS.flatMap((band) => {
    const from = along(Math.max(band.from, floor))
    const to = along(Math.min(band.to, top))
    return to > from ? [{ label: band.label, from, to }] : []
  })

  return (
    <div className="volatility-ranges">
      <span className="volatility-ranges-head type-11">Volatility Range</span>
      <div className="volatility-ranges-plot">
        {/* A dashed line between each band and the next, down every row. */}
        <span className="volatility-ranges-bands" aria-hidden="true">
          {bands.slice(1).map((band) => (
            <span
              key={band.label}
              className="volatility-ranges-divider"
              style={{ left: `${String(band.from)}%` }}
            />
          ))}
        </span>
        {ranges.map((range, at) =>
          range === undefined ? (
            <span key={at} style={{ height: row }} />
          ) : (
            <HoverTip
              key={range.head}
              className="volatility-range"
              tip={<RangeTip range={range} />}
            >
              <span className="volatility-range-row" style={{ height: row }}>
                {/*
                  The whole scale's gradient, clipped to this bar's stretch of
                  it, so a colour means the same volatility on every row
                  (Karan, 2026-11-22).
                */}
                <span
                  className="volatility-range-bar"
                  style={{
                    clipPath: `inset(0 ${String(100 - along(range.high))}% 0 ${String(along(range.low))}%)`
                  }}
                />
                {range.latest !== undefined && (
                  <span
                    className="volatility-range-now"
                    style={{ left: `${String(along(range.latest))}%` }}
                  />
                )}
                {/* Its lowest and highest, at its two ends (Karan, 2026-11-22). */}
                <span
                  className="volatility-range-end volatility-range-low"
                  style={{ right: `${String(100 - along(range.low))}%` }}
                >
                  {percent(range.low * 100, 0)}
                </span>
                <span
                  className="volatility-range-end volatility-range-high"
                  style={{ left: `${String(along(range.high))}%` }}
                >
                  {percent(range.high * 100, 0)}
                </span>
              </span>
            </HoverTip>
          )
        )}
      </div>
      {/* Each band's name under its middle, out of the flow so the rows stay level. */}
      <span className="volatility-ranges-bands volatility-ranges-names type-11" aria-hidden="true">
        {bands
          .filter((band) => band.to - band.from >= NAMEABLE)
          .map((band) => (
            <span key={band.label} style={{ left: `${String((band.from + band.to) / 2)}%` }}>
              {band.label}
            </span>
          ))}
      </span>
    </div>
  )
}

function RangeTip({ range }: { range: VolatilityRange }): ReactElement {
  const show = (value: number | undefined): string =>
    percent(value === undefined ? undefined : value * 100, 1)
  return (
    <>
      <div className="header-tip-title">{range.name}</div>
      <dl className="header-tip-params">
        <dt>Now</dt>
        <dd>{show(range.latest)}</dd>
        <dt>Lowest</dt>
        <dd>{show(range.low)}</dd>
        <dt>Highest</dt>
        <dd>{show(range.high)}</dd>
      </dl>
    </>
  )
}
