import { useRef, useState, type ReactElement } from 'react'
import { HoverTip } from '../index-overview/HoverTip'
import { columnOf, dayOf, numberIn, type Part } from './profile'

/** The strip's height in px, which its drawing's units also are. */
const TALL = 40

const signed = (value: number): string => `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%`

/**
 * The fund's active weight against the comparator each day, as a bar a day
 * under the weight curve (Karan, 2026-11-27): overweight up in green,
 * underweight down in red, as the OW and UW token beside the name. Each
 * day's figure is the engine's; the hover popup names the day under the
 * pointer.
 */
export function ActiveWeights({
  daily,
  against
}: {
  daily: Part | undefined
  /** The comparator the active weight is against. */
  against: string | undefined
}): ReactElement {
  const strip = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<number | undefined>(undefined)
  const days = (daily?.rows ?? []).flatMap((row) => {
    const active = numberIn(row, 'active')
    return active === undefined ? [] : [{ date: row.date, active }]
  })
  if (days.length === 0) {
    return <p className="summary-profile-none type-11">No comparator's weights on this run</p>
  }
  const most = Math.max(...days.map((day) => day.active), 0)
  const least = Math.min(...days.map((day) => day.active), 0)
  const scale = TALL / Math.max(most - least, 1e-9)
  const zero = most * scale
  const label = (
    (against === undefined ? undefined : columnOf(daily, against)?.label) ?? 'comparator'
  ).toLowerCase()
  const day = hovered === undefined ? undefined : days[hovered]
  const over = days.filter((each) => each.active > 0).length
  const under = days.filter((each) => each.active < 0).length

  return (
    <HoverTip
      className="weight-histogram"
      tip={
        day === undefined ? (
          <>
            <div className="header-tip-title">{`Against the ${label}`}</div>
            <div>{`Overweight on ${String(over)} days, underweight on ${String(under)}`}</div>
            <div className="header-tip-kind">{`${signed(least)} to ${signed(most)}`}</div>
          </>
        ) : (
          <>
            <div className="header-tip-title">{dayOf(day.date)}</div>
            <div>{`${signed(day.active)} against the ${label}`}</div>
          </>
        )
      }
    >
      <div
        ref={strip}
        className="active-weights-strip"
        aria-label={`Active weight against the ${label}, each day`}
        onMouseMove={(event) => {
          const box = strip.current?.getBoundingClientRect()
          if (box === undefined || box.width === 0) return
          const share = (event.clientX - box.left) / box.width
          setHovered(Math.min(days.length - 1, Math.max(0, Math.floor(share * days.length))))
        }}
        onMouseLeave={() => {
          setHovered(undefined)
        }}
      >
        <svg
          viewBox={`0 0 ${String(days.length)} ${String(TALL)}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path className="active-weights-over" d={barsOf(days, zero, scale, true)} />
          <path className="active-weights-under" d={barsOf(days, zero, scale, false)} />
          <line className="active-weights-zero" x1={0} x2={days.length} y1={zero} y2={zero} />
          {hovered !== undefined && (
            <line
              className="active-weights-hover"
              x1={hovered + 0.5}
              x2={hovered + 0.5}
              y1={0}
              y2={TALL}
            />
          )}
        </svg>
      </div>
      <div className="weight-histogram-axis type-11">
        <span>{dayOf(days[0]?.date ?? '')}</span>
        <span>{dayOf(days.at(-1)?.date ?? '')}</span>
      </div>
    </HoverTip>
  )
}

/** One side's daily bars as one path, each a day wide, standing on the zero line. */
function barsOf(
  days: readonly { active: number }[],
  zero: number,
  scale: number,
  over: boolean
): string {
  return days
    .map((day, at) => {
      if (over ? day.active <= 0 : day.active >= 0) return ''
      const top = (zero - day.active * scale).toFixed(2)
      return `M${String(at)} ${zero.toFixed(2)}V${top}h1V${zero.toFixed(2)}Z`
    })
    .join('')
}
