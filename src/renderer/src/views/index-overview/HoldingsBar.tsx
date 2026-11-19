import type { CSSProperties, ReactElement } from 'react'
import type { TableFrame } from '../../api/analytics'
import { percent } from '../shared/indexMetrics'
import { HoverTip } from './HoverTip'

/** A frame's cell by its row's first column and the column's name. */
function cell(frame: TableFrame, row: string | number, column: string): number | undefined {
  const at = frame.columns.indexOf(column)
  const found = frame.data.find((cells) => cells[0] === row)
  const value = found?.[at]
  return typeof value === 'number' ? value : undefined
}

/**
 * How many names the fund held (BU-294), on one line beside its title: the
 * bar runs from the fewest names held to the most, each count shaded by how
 * long the fund held that many, with a tick at the latest. The fewest and
 * most sit under its ends; the rest is in the hover popup (Karan,
 * 2026-11-19).
 */
export function HoldingsBar({
  range,
  days
}: {
  range: TableFrame | undefined
  days: TableFrame | undefined
}): ReactElement {
  if (range === undefined) {
    return (
      <div className="holdings-line">
        <h3 className="section-title">Holdings</h3>
        <p className="summary-profile-none type-11">Not worked out</p>
      </div>
    )
  }
  const least = cell(range, 'least', 'fund') ?? 0
  const most = cell(range, 'most', 'fund') ?? least
  const latest = cell(range, 'latest', 'fund') ?? least
  const index = cell(range, 'latest', 'index')
  const counts = Array.from({ length: most - least + 1 }, (_, at) => least + at)
  const shareOf = (count: number): number =>
    days === undefined ? 1 : (cell(days, count, 'share') ?? 0)
  const longest = Math.max(...counts.map(shareOf), 0.0001)
  // The tick at the middle of the latest count's segment.
  const tick = ((latest - least + 0.5) / counts.length) * 100

  return (
    <div className="holdings-line">
      <h3 className="section-title">Holdings</h3>
      <HoverTip
        className="holdings-bar"
        tip={
          <>
            <div className="header-tip-title">{`${String(latest)} names held now`}</div>
            <div>{`${String(least)} to ${String(most)} over the run`}</div>
            {index !== undefined && (
              <div className="header-tip-kind">{`${String(index)} in the index`}</div>
            )}
            {days !== undefined && (
              <dl className="header-tip-params">
                {counts.flatMap((count) => [
                  <dt key={`${String(count)}-names`}>{`${String(count)} names`}</dt>,
                  <dd key={`${String(count)}-share`}>
                    {`${percent(shareOf(count) * 100, 0)} of days`}
                  </dd>
                ])}
              </dl>
            )}
          </>
        }
      >
        <div className="holdings-bar-track" aria-label={`${String(latest)} names held`}>
          {counts.map((count) => (
            <span
              key={count}
              className="holdings-bar-count"
              // Deeper the longer the fund held this many names.
              style={
                {
                  '--held': `${String(Math.round((shareOf(count) / longest) * 100))}%`
                } as CSSProperties
              }
            />
          ))}
          <span className="holdings-bar-latest" style={{ left: `${String(tick)}%` }} />
        </div>
        <div className="holdings-bar-ends type-11">
          <span>{least}</span>
          <span>{most}</span>
        </div>
      </HoverTip>
    </div>
  )
}
